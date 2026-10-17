--!nocheck
--[[
	Bloxy Studio plugin

	Connects Roblox Studio to the Bloxy website. The website's AI sends commands
	(read scripts, edit instances, run Luau, ...) and this plugin runs them in
	Studio and sends the results back.

	Install: copy this file to %LOCALAPPDATA%\Roblox\Plugins\Bloxy.server.lua
	(or Plugins > Plugins Folder in Studio), then restart Studio.
]]

local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local Selection = game:GetService("Selection")
local RunService = game:GetService("RunService")
local LogService = game:GetService("LogService")
local InsertService = game:GetService("InsertService")
local CollectionService = game:GetService("CollectionService")

if RunService:IsRunning() and not RunService:IsEdit() then
	-- Don't start a second bridge inside playtest DataModels.
	return
end

local DEFAULT_SERVER = "https://trybloxy.com"
local PLUGIN_VERSION = "0.4.0"
local MAX_RESULT_CHARS = 200000
-- The 3D snapshot is sent straight to the website, not to the AI, so it may be bigger.
local MAX_SCENE_CHARS = 1500000

--------------------------------------------------------------------------------
-- Paths
--------------------------------------------------------------------------------

local function pathOf(inst)
	if inst == game then
		return "game"
	end
	local parts = {}
	local cur = inst
	while cur and cur ~= game do
		table.insert(parts, 1, cur.Name)
		cur = cur.Parent
	end
	if cur ~= game then
		return "<detached>." .. table.concat(parts, ".")
	end
	return table.concat(parts, ".")
end

local function resolve(path)
	if path == nil or path == "" or path == "game" then
		return game
	end
	if typeof(path) ~= "string" then
		error("path must be a string")
	end
	path = path:gsub("^game%.", "")
	local cur = game
	local first = true
	for seg in string.gmatch(path, "[^%.]+") do
		local nextInst = cur:FindFirstChild(seg)
		if not nextInst and first then
			local ok, svc = pcall(game.GetService, game, seg)
			if ok then
				nextInst = svc
			end
		end
		if not nextInst then
			error(("Could not find '%s' in %s"):format(seg, pathOf(cur)))
		end
		cur = nextInst
		first = false
	end
	return cur
end

--------------------------------------------------------------------------------
-- Value (de)serialization
--------------------------------------------------------------------------------

local serialize

local function round(n)
	if n ~= n or n == math.huge or n == -math.huge then
		return tostring(n)
	end
	return math.floor(n * 1000 + 0.5) / 1000
end

function serialize(v, depth)
	depth = depth or 0
	local t = typeof(v)
	if t == "nil" then
		return nil
	elseif t == "boolean" or t == "string" then
		return v
	elseif t == "number" then
		return round(v)
	elseif t == "Vector3" then
		return { _t = "Vector3", x = round(v.X), y = round(v.Y), z = round(v.Z) }
	elseif t == "Vector2" then
		return { _t = "Vector2", x = round(v.X), y = round(v.Y) }
	elseif t == "Color3" then
		return { _t = "Color3", hex = "#" .. v:ToHex(), r = round(v.R), g = round(v.G), b = round(v.B) }
	elseif t == "CFrame" then
		local rx, ry, rz = v:ToOrientation()
		return {
			_t = "CFrame",
			position = { round(v.X), round(v.Y), round(v.Z) },
			orientationDeg = { round(math.deg(rx)), round(math.deg(ry)), round(math.deg(rz)) },
		}
	elseif t == "UDim2" then
		return { _t = "UDim2", xs = round(v.X.Scale), xo = v.X.Offset, ys = round(v.Y.Scale), yo = v.Y.Offset }
	elseif t == "UDim" then
		return { _t = "UDim", s = round(v.Scale), o = v.Offset }
	elseif t == "BrickColor" then
		return { _t = "BrickColor", name = v.Name }
	elseif t == "EnumItem" then
		return { _t = "Enum", enum = tostring(v.EnumType), name = v.Name }
	elseif t == "Instance" then
		return { _t = "Instance", path = pathOf(v), className = v.ClassName }
	elseif t == "NumberRange" then
		return { _t = "NumberRange", min = round(v.Min), max = round(v.Max) }
	elseif t == "table" then
		if depth > 6 then
			return "<table>"
		end
		local out = {}
		local isArray = #v > 0
		for k, val in pairs(v) do
			if isArray then
				if typeof(k) == "number" then
					out[k] = serialize(val, depth + 1)
				end
			else
				out[tostring(k)] = serialize(val, depth + 1)
			end
		end
		return out
	else
		return { _t = t, value = tostring(v) }
	end
end

-- Turn a JSON value into a Roblox value. `current` (the property's present
-- value) lets plain JSON coerce into the right type, e.g. "Neon" -> Enum.Material.Neon.
local function deserialize(v, current)
	local ct = typeof(current)
	if typeof(v) == "table" and v._t then
		local t = v._t
		if t == "Vector3" then
			return Vector3.new(v.x or 0, v.y or 0, v.z or 0)
		elseif t == "Vector2" then
			return Vector2.new(v.x or 0, v.y or 0)
		elseif t == "Color3" then
			if v.hex then
				return Color3.fromHex(v.hex)
			elseif v.r255 or v.g255 or v.b255 then
				return Color3.fromRGB(v.r255 or 0, v.g255 or 0, v.b255 or 0)
			end
			return Color3.new(v.r or 0, v.g or 0, v.b or 0)
		elseif t == "CFrame" then
			local p = v.position or { 0, 0, 0 }
			local cf = CFrame.new(p[1], p[2], p[3])
			if v.lookAt then
				cf = CFrame.lookAt(cf.Position, Vector3.new(v.lookAt[1], v.lookAt[2], v.lookAt[3]))
			elseif v.orientationDeg then
				local o = v.orientationDeg
				cf = cf * CFrame.fromOrientation(math.rad(o[1]), math.rad(o[2]), math.rad(o[3]))
			end
			return cf
		elseif t == "UDim2" then
			return UDim2.new(v.xs or 0, v.xo or 0, v.ys or 0, v.yo or 0)
		elseif t == "UDim" then
			return UDim.new(v.s or 0, v.o or 0)
		elseif t == "BrickColor" then
			return BrickColor.new(v.name)
		elseif t == "Enum" then
			return Enum[v.enum][v.name]
		elseif t == "Instance" then
			return resolve(v.path)
		elseif t == "NumberRange" then
			return NumberRange.new(v.min or 0, v.max or v.min or 0)
		end
		error("Unsupported value type: " .. tostring(t))
	end

	-- Coercions from plain JSON based on the property's current type.
	if ct == "EnumItem" and typeof(v) == "string" then
		return current.EnumType[v]
	elseif ct == "EnumItem" and typeof(v) == "number" then
		for _, item in ipairs(current.EnumType:GetEnumItems()) do
			if item.Value == v then
				return item
			end
		end
	elseif ct == "Color3" and typeof(v) == "string" then
		return Color3.fromHex(v)
	elseif ct == "Color3" and typeof(v) == "table" then
		return Color3.fromRGB(v[1], v[2], v[3])
	elseif ct == "BrickColor" and typeof(v) == "string" then
		return BrickColor.new(v)
	elseif ct == "Vector3" and typeof(v) == "table" then
		return Vector3.new(v[1] or v.x or 0, v[2] or v.y or 0, v[3] or v.z or 0)
	elseif ct == "Vector2" and typeof(v) == "table" then
		return Vector2.new(v[1] or v.x or 0, v[2] or v.y or 0)
	elseif ct == "UDim2" and typeof(v) == "table" then
		return UDim2.new(v[1] or 0, v[2] or 0, v[3] or 0, v[4] or 0)
	elseif ct == "CFrame" and typeof(v) == "table" and #v >= 3 then
		return CFrame.new(v[1], v[2], v[3])
	end
	return v
end

local COMMON_PROPS = {
	"Name", "ClassName", "Archivable",
	-- BasePart
	"Position", "Orientation", "Size", "CFrame", "Color", "BrickColor", "Material", "Transparency",
	"Reflectance", "Anchored", "CanCollide", "CanTouch", "CanQuery", "CastShadow", "Shape", "Massless",
	-- Model
	"PrimaryPart", "WorldPivot",
	-- Scripts
	"Enabled", "Disabled", "RunContext",
	-- GUI
	"Text", "TextColor3", "TextSize", "Font", "TextScaled", "BackgroundColor3", "BackgroundTransparency",
	"Image", "ImageColor3", "Visible", "ZIndex", "LayoutOrder", "AnchorPoint", "SizeConstraint",
	"AutomaticSize", "ResetOnSpawn", "ZIndexBehavior",
	-- Misc
	"Value", "MeshId", "TextureID", "SoundId", "Volume", "Looped", "Playing", "AnimationId",
	"Brightness", "Range", "Face", "Texture", "Health", "MaxHealth", "WalkSpeed", "JumpPower",
	"ClockTime", "Ambient", "OutdoorAmbient", "FogEnd", "FogColor", "Gravity",
}

local function readProps(inst, names)
	local out = {}
	for _, name in ipairs(names) do
		local ok, value = pcall(function()
			return inst[name]
		end)
		if ok and typeof(value) ~= "RBXScriptSignal" and typeof(value) ~= "function" then
			out[name] = serialize(value)
		end
	end
	return out
end

--------------------------------------------------------------------------------
-- Tools
--------------------------------------------------------------------------------

local function isScript(inst)
	return inst:IsA("LuaSourceContainer")
end

local function getSource(scr)
	local ok, src = pcall(function()
		return ScriptEditorService:GetEditorSource(scr)
	end)
	if ok and src then
		return src
	end
	return scr.Source
end

local function setSource(scr, source)
	local ok = pcall(function()
		ScriptEditorService:UpdateSourceAsync(scr, function()
			return source
		end)
	end)
	if not ok then
		scr.Source = source
	end
end

local function withUndo(name, fn)
	local recording = ChangeHistoryService:TryBeginRecording("Bloxy: " .. name)
	local ok, result = pcall(fn)
	if recording then
		ChangeHistoryService:FinishRecording(
			recording,
			ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel
		)
	end
	if not ok then
		error(result, 0)
	end
	return result
end

local function applyProps(inst, props)
	local errors = {}
	if typeof(props) ~= "table" then
		return errors
	end
	-- Set Parent last so the instance is fully configured before it replicates.
	local parentValue = props.Parent
	for name, value in pairs(props) do
		if name ~= "Parent" then
			local ok, err = pcall(function()
				local current = inst[name]
				inst[name] = deserialize(value, current)
			end)
			if not ok then
				errors[name] = tostring(err)
			end
		end
	end
	if parentValue ~= nil then
		local ok, err = pcall(function()
			inst.Parent = typeof(parentValue) == "string" and resolve(parentValue) or deserialize(parentValue)
		end)
		if not ok then
			errors.Parent = tostring(err)
		end
	end
	return errors
end

local tools = {}

function tools.get_studio_state()
	local selection = {}
	for i, inst in ipairs(Selection:Get()) do
		if i > 50 then
			break
		end
		table.insert(selection, { path = pathOf(inst), className = inst.ClassName })
	end
	local cam = workspace.CurrentCamera
	return {
		placeName = game.Name,
		placeId = game.PlaceId,
		gameId = game.GameId,
		isRunning = RunService:IsRunning(),
		selection = selection,
		camera = cam and serialize(cam.CFrame) or nil,
		services = (function()
			local names = {}
			for _, child in ipairs(game:GetChildren()) do
				local ok, name = pcall(function()
					return child.Name
				end)
				if ok then
					table.insert(names, name)
				end
			end
			return names
		end)(),
	}
end

function tools.list_children(args)
	local root = resolve(args.path)
	local maxDepth = math.clamp(args.depth or 1, 1, 5)
	local limit = math.clamp(args.limit or 200, 1, 1000)
	local count = 0
	local truncated = false

	local function walk(inst, depth)
		local node = { name = inst.Name, className = inst.ClassName, path = pathOf(inst) }
		local children = inst:GetChildren()
		node.childCount = #children
		if depth < maxDepth and #children > 0 then
			node.children = {}
			for _, child in ipairs(children) do
				if count >= limit then
					truncated = true
					break
				end
				count += 1
				local ok, childNode = pcall(walk, child, depth + 1)
				if ok then
					table.insert(node.children, childNode)
				end
			end
		end
		return node
	end

	return { tree = walk(root, 0), truncated = truncated }
end

function tools.search_instances(args)
	local root = resolve(args.root)
	local nameQuery = args.name and string.lower(args.name) or nil
	local className = args.className
	local tag = args.tag
	local limit = math.clamp(args.limit or 50, 1, 500)
	local results = {}
	local candidates = tag and CollectionService:GetTagged(tag) or root:GetDescendants()
	for _, inst in ipairs(candidates) do
		local ok, match = pcall(function()
			if tag and not inst:IsDescendantOf(root) then
				return false
			end
			if className and not inst:IsA(className) then
				return false
			end
			if nameQuery and not string.find(string.lower(inst.Name), nameQuery, 1, true) then
				return false
			end
			return true
		end)
		if ok and match then
			table.insert(results, { path = pathOf(inst), className = inst.ClassName })
			if #results >= limit then
				return { results = results, truncated = true }
			end
		end
	end
	return { results = results, truncated = false }
end

function tools.get_properties(args)
	local inst = resolve(args.path)
	local names = args.properties
	if typeof(names) ~= "table" or #names == 0 then
		names = COMMON_PROPS
	end
	local attributes = {}
	for k, v in pairs(inst:GetAttributes()) do
		attributes[k] = serialize(v)
	end
	return {
		path = pathOf(inst),
		className = inst.ClassName,
		properties = readProps(inst, names),
		attributes = attributes,
		tags = CollectionService:GetTags(inst),
		childCount = #inst:GetChildren(),
	}
end

function tools.set_properties(args)
	local inst = resolve(args.path)
	return withUndo("set properties", function()
		local errors = applyProps(inst, args.properties)
		if typeof(args.attributes) == "table" then
			for k, v in pairs(args.attributes) do
				local ok, err = pcall(function()
					inst:SetAttribute(k, deserialize(v, inst:GetAttribute(k)))
				end)
				if not ok then
					errors["@" .. k] = tostring(err)
				end
			end
		end
		return { path = pathOf(inst), errors = errors }
	end)
end

function tools.create_instance(args)
	local parent = resolve(args.parent)
	return withUndo("create " .. tostring(args.className), function()
		local inst = Instance.new(args.className)
		if args.name then
			inst.Name = args.name
		end
		local errors = applyProps(inst, args.properties)
		if isScript(inst) and args.source then
			inst.Source = args.source
		end
		inst.Parent = parent
		return { path = pathOf(inst), className = inst.ClassName, errors = errors }
	end)
end

function tools.delete_instance(args)
	local inst = resolve(args.path)
	if inst == game or inst.Parent == game then
		error("Refusing to delete a service or the DataModel")
	end
	local p = pathOf(inst)
	withUndo("delete " .. inst.Name, function()
		inst:Destroy()
	end)
	return { deleted = p }
end

function tools.clone_instance(args)
	local inst = resolve(args.path)
	return withUndo("clone " .. inst.Name, function()
		local copy = inst:Clone()
		if not copy then
			error("Instance is not Archivable and cannot be cloned")
		end
		if args.name then
			copy.Name = args.name
		end
		copy.Parent = args.parent and resolve(args.parent) or inst.Parent
		return { path = pathOf(copy) }
	end)
end

function tools.read_script(args)
	local scr = resolve(args.path)
	if not isScript(scr) then
		error(pathOf(scr) .. " is a " .. scr.ClassName .. ", not a script")
	end
	local source = getSource(scr)
	local lines = string.split(source, "\n")
	local startLine = math.max(1, args.startLine or 1)
	local endLine = math.min(#lines, args.endLine or #lines)
	local slice = {}
	for i = startLine, endLine do
		table.insert(slice, lines[i])
	end
	return {
		path = pathOf(scr),
		className = scr.ClassName,
		lineCount = #lines,
		startLine = startLine,
		endLine = endLine,
		source = table.concat(slice, "\n"),
	}
end

function tools.write_script(args)
	if typeof(args.source) ~= "string" then
		error("source must be a string")
	end
	return withUndo("write script", function()
		local ok, existing = pcall(resolve, args.path)
		if ok and existing then
			if not isScript(existing) then
				error(pathOf(existing) .. " exists and is not a script")
			end
			setSource(existing, args.source)
			return { path = pathOf(existing), created = false, lineCount = #string.split(args.source, "\n") }
		end
		-- Create it: parent = everything before the last dot, name = last segment.
		local parentPath, name = string.match(args.path, "^(.*)%.([^%.]+)$")
		if not parentPath then
			error("path must include a parent, e.g. ServerScriptService.MyScript")
		end
		local parent = resolve(parentPath)
		local scr = Instance.new(args.className or "Script")
		scr.Name = name
		scr.Source = args.source
		scr.Parent = parent
		return { path = pathOf(scr), created = true, className = scr.ClassName }
	end)
end

function tools.edit_script(args)
	local scr = resolve(args.path)
	if not isScript(scr) then
		error(pathOf(scr) .. " is not a script")
	end
	local source = getSource(scr)
	local s, e = string.find(source, args.oldText, 1, true)
	if not s then
		error("oldText was not found in the script. Read the script again and copy the text exactly.")
	end
	if string.find(source, args.oldText, e + 1, true) and not args.replaceAll then
		error("oldText appears more than once. Include more surrounding lines so it is unique, or set replaceAll.")
	end
	local newSource
	if args.replaceAll then
		local parts = {}
		local pos = 1
		while true do
			local a, b = string.find(source, args.oldText, pos, true)
			if not a then
				table.insert(parts, string.sub(source, pos))
				break
			end
			table.insert(parts, string.sub(source, pos, a - 1))
			table.insert(parts, args.newText)
			pos = b + 1
		end
		newSource = table.concat(parts)
	else
		newSource = string.sub(source, 1, s - 1) .. args.newText .. string.sub(source, e + 1)
	end
	withUndo("edit script", function()
		setSource(scr, newSource)
	end)
	return { path = pathOf(scr), lineCount = #string.split(newSource, "\n") }
end

function tools.grep_scripts(args)
	local pattern = args.pattern
	local plain = args.regex ~= true
	local limit = math.clamp(args.limit or 100, 1, 500)
	local root = resolve(args.root)
	local matches = {}
	local caseInsensitive = args.caseSensitive ~= true
	local needle = caseInsensitive and plain and string.lower(pattern) or pattern
	for _, inst in ipairs(root:GetDescendants()) do
		if isScript(inst) then
			local okSrc, source = pcall(getSource, inst)
			if okSrc then
				local lineNo = 0
				for line in string.gmatch(source .. "\n", "(.-)\n") do
					lineNo += 1
					local hay = (caseInsensitive and plain) and string.lower(line) or line
					local okFind, found = pcall(string.find, hay, needle, 1, plain)
					if okFind and found then
						table.insert(matches, { path = pathOf(inst), line = lineNo, text = string.sub(line, 1, 300) })
						if #matches >= limit then
							return { matches = matches, truncated = true }
						end
					end
				end
			end
		end
	end
	return { matches = matches, truncated = false }
end

function tools.run_luau(args)
	local fn, compileErr = loadstring(args.code, "=bloxy")
	if not fn then
		error("Compile error: " .. tostring(compileErr))
	end
	local output = {}
	local function capture(kind)
		return function(...)
			local parts = {}
			for i = 1, select("#", ...) do
				table.insert(parts, tostring((select(i, ...))))
			end
			table.insert(output, (kind ~= "" and kind .. ": " or "") .. table.concat(parts, " "))
		end
	end
	local env = setmetatable({ print = capture(""), warn = capture("warn") }, { __index = getfenv(1) })
	setfenv(fn, env)
	local results = withUndo("run Luau", function()
		return table.pack(pcall(fn))
	end)
	local ok = results[1]
	if not ok then
		return { ok = false, error = tostring(results[2]), output = output }
	end
	local returns = {}
	for i = 2, results.n do
		table.insert(returns, serialize(results[i]))
	end
	return { ok = true, returns = returns, output = output }
end

function tools.get_output(args)
	local limit = math.clamp(args.limit or 50, 1, 500)
	local history = LogService:GetLogHistory()
	local out = {}
	for i = math.max(1, #history - limit + 1), #history do
		local entry = history[i]
		table.insert(out, { type = entry.messageType.Name, message = string.sub(entry.message, 1, 1000) })
	end
	return { entries = out }
end

function tools.insert_asset(args)
	local parent = args.parent and resolve(args.parent) or workspace
	return withUndo("insert asset", function()
		local ok, model = pcall(function()
			return InsertService:LoadAsset(args.assetId)
		end)
		local objects
		if ok and model then
			objects = model:GetChildren()
		else
			objects = game:GetObjects("rbxassetid://" .. tostring(args.assetId))
		end
		local paths = {}
		for _, obj in ipairs(objects) do
			obj.Parent = parent
			table.insert(paths, pathOf(obj))
		end
		return { inserted = paths }
	end)
end

-- Compact snapshot of every visible BasePart for the website's 3D workspace.
-- Arrays instead of keyed tables keep the JSON small for big places.
function tools.get_scene(args)
	local root = resolve(args.root or "Workspace")
	local limit = math.clamp(args.limit or 3000, 1, 8000)
	local parts = {}
	local truncated = false
	for _, inst in ipairs(root:GetDescendants()) do
		if inst:IsA("BasePart") and not inst:IsA("Terrain") and inst.Transparency < 1 then
			if #parts >= limit then
				truncated = true
				break
			end
			local shape = "Block"
			if inst:IsA("Part") then
				shape = inst.Shape.Name
			elseif inst:IsA("WedgePart") then
				shape = "Wedge"
			elseif inst:IsA("CornerWedgePart") then
				shape = "CornerWedge"
			elseif inst:IsA("MeshPart") then
				shape = "Mesh"
			end
			local cf = inst.CFrame
			local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:GetComponents()
			local s = inst.Size
			local c = inst.Color
			table.insert(parts, {
				pathOf(inst),
				shape,
				{ round(s.X), round(s.Y), round(s.Z) },
				{ round(x), round(y), round(z), round(r00), round(r01), round(r02), round(r10), round(r11), round(r12), round(r20), round(r21), round(r22) },
				string.format("%02x%02x%02x", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5)),
				round(inst.Transparency),
				inst.Material.Name,
			})
		end
	end
	local cam = workspace.CurrentCamera
	local camPos, camLook
	if cam then
		camPos = { round(cam.CFrame.X), round(cam.CFrame.Y), round(cam.CFrame.Z) }
		local look = cam.CFrame.Position + cam.CFrame.LookVector * 50
		camLook = { round(look.X), round(look.Y), round(look.Z) }
	end
	return {
		format = "bloxy-scene-1",
		fields = { "path", "shape", "size", "cframe", "color", "transparency", "material" },
		parts = parts,
		truncated = truncated,
		camera = camPos and { position = camPos, target = camLook } or nil,
	}
end

-- Builds a generated model ("3D as code" from the website) as one anchored Model,
-- centred on the ground where the Studio camera is looking. One undo step.
function tools.insert_parts(args)
	if typeof(args.parts) ~= "table" or #args.parts == 0 then
		error("parts must be a non-empty list")
	end
	local origin
	if typeof(args.at) == "table" then
		origin = Vector3.new(args.at[1] or 0, args.at[2] or 0, args.at[3] or 0)
	else
		local cam = workspace.CurrentCamera
		local focus = cam and cam.Focus.Position or Vector3.zero
		origin = Vector3.new(focus.X, 0, focus.Z)
	end
	return withUndo("insert " .. tostring(args.name or "model"), function()
		local model = Instance.new("Model")
		model.Name = tostring(args.name or "BloxyModel")
		local shapes = { Block = Enum.PartType.Block, Ball = Enum.PartType.Ball, Cylinder = Enum.PartType.Cylinder }
		for i, spec in ipairs(args.parts) do
			local part
			if spec.shape == "Wedge" then
				part = Instance.new("WedgePart")
			else
				part = Instance.new("Part")
				part.Shape = shapes[spec.shape] or Enum.PartType.Block
			end
			part.Name = tostring(spec.name or ("Part" .. i))
			part.Anchored = true
			local s, p, r = spec.size or {}, spec.position or {}, spec.rotation or {}
			part.Size = Vector3.new(s[1] or 1, s[2] or 1, s[3] or 1)
			part.CFrame = CFrame.new(origin + Vector3.new(p[1] or 0, p[2] or 0, p[3] or 0))
				* CFrame.fromOrientation(math.rad(r[1] or 0), math.rad(r[2] or 0), math.rad(r[3] or 0))
			pcall(function()
				part.Color = Color3.fromHex(tostring(spec.color or "a3a2a5"))
			end)
			pcall(function()
				part.Material = Enum.Material[spec.material or "Plastic"]
			end)
			part.Transparency = tonumber(spec.transparency) or 0
			part.TopSurface = Enum.SurfaceType.Smooth
			part.BottomSurface = Enum.SurfaceType.Smooth
			part.Parent = model
			if i == 1 then
				model.PrimaryPart = part
			end
		end
		model.Parent = workspace
		Selection:Set({ model })
		return { path = pathOf(model), parts = #args.parts }
	end)
end

function tools.set_selection(args)
	local list = {}
	for _, p in ipairs(args.paths or {}) do
		table.insert(list, resolve(p))
	end
	Selection:Set(list)
	return { selected = #list }
end

--------------------------------------------------------------------------------
-- HTTP bridge
--------------------------------------------------------------------------------

local state = {
	server = plugin:GetSetting("BloxyServer") or DEFAULT_SERVER,
	token = plugin:GetSetting("BloxyToken"),
	connected = false,
	loopId = 0,
}

local ui -- forward-declared, set up below

local function setStatus(text, color)
	if ui then
		ui.status.Text = text
		ui.status.TextColor3 = color or Color3.fromRGB(200, 200, 200)
	end
end

local function logLine(text)
	if ui then
		ui.log.Text = (text .. "\n" .. ui.log.Text):sub(1, 1500)
	end
end

local function studioInfo()
	return { placeName = game.Name, placeId = game.PlaceId, pluginVersion = PLUGIN_VERSION }
end

local function request(method, route, body)
	local headers = { ["Content-Type"] = "application/json" }
	if state.token then
		headers["X-Bloxy-Token"] = state.token
	end
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = state.server:gsub("/+$", "") .. route,
			Method = method,
			Headers = headers,
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok then
		return nil, tostring(res)
	end
	local decoded = nil
	pcall(function()
		decoded = HttpService:JSONDecode(res.Body)
	end)
	return res, decoded
end

local function encodeResult(id, ok, value, maxChars)
	local payload = { id = id, ok = ok }
	if ok then
		payload.result = value
	else
		payload.error = tostring(value)
	end
	local encodedOk, encoded = pcall(HttpService.JSONEncode, HttpService, payload)
	if not encodedOk then
		payload = { id = id, ok = false, error = "Result could not be encoded as JSON: " .. tostring(encoded) }
	elseif #encoded > (maxChars or MAX_RESULT_CHARS) then
		payload = {
			id = id,
			ok = false,
			error = ("Result too large (%d chars). Ask for less, e.g. a smaller depth, a line range or a limit."):format(#encoded),
		}
	end
	return payload
end

local function handleCommand(cmd)
	local fn = tools[cmd.tool]
	local ok, result
	if not fn then
		ok, result = false, "Unknown tool: " .. tostring(cmd.tool)
	else
		ok, result = pcall(fn, cmd.args or {})
	end
	logLine((ok and "✓ " or "✗ ") .. tostring(cmd.tool))
	local maxChars = cmd.tool == "get_scene" and MAX_SCENE_CHARS or MAX_RESULT_CHARS
	request("POST", "/api/plugin/result", encodeResult(cmd.id, ok, result, maxChars))
end

local function stopLoop()
	state.loopId += 1
	state.connected = false
	if state.onConnection then
		state.onConnection(false)
	end
end

local function startLoop()
	stopLoop()
	local myId = state.loopId
	state.connected = true
	if state.onConnection then
		state.onConnection(true)
	end
	setStatus("Connected", Color3.fromRGB(80, 220, 120))
	if ui then
		ui.button.Text = "Disconnect"
	end
	task.spawn(function()
		local failures = 0
		while state.loopId == myId do
			local res, data = request("POST", "/api/plugin/poll", { studio = studioInfo() })
			if state.loopId ~= myId then
				break
			end
			if res and res.StatusCode == 401 then
				state.token = nil
				plugin:SetSetting("BloxyToken", nil)
				stopLoop()
				setStatus("Pairing expired. Enter a new code.", Color3.fromRGB(255, 170, 60))
				if ui then
					ui.button.Text = "Connect"
				end
				break
			elseif res and res.Success and typeof(data) == "table" then
				if failures > 0 then
					setStatus("Connected", Color3.fromRGB(80, 220, 120))
				end
				failures = 0
				for _, cmd in ipairs(data.commands or {}) do
					task.spawn(handleCommand, cmd)
				end
			else
				failures += 1
				setStatus(("Reconnecting… (%d)"):format(failures), Color3.fromRGB(255, 170, 60))
				task.wait(math.min(2 * failures, 15))
			end
		end
	end)
end

local function connectWithCode(code)
	state.server = ui.server.Text ~= "" and ui.server.Text or DEFAULT_SERVER
	plugin:SetSetting("BloxyServer", state.server)
	state.token = nil
	setStatus("Pairing…")
	local res, data = request("POST", "/api/plugin/connect", { code = code, studio = studioInfo() })
	if not res then
		setStatus("Can't reach server: " .. tostring(data), Color3.fromRGB(255, 90, 90))
		return
	end
	if not res.Success or typeof(data) ~= "table" or not data.pluginToken then
		setStatus("Invalid or expired code", Color3.fromRGB(255, 90, 90))
		return
	end
	state.token = data.pluginToken
	plugin:SetSetting("BloxyToken", state.token)
	ui.code.Text = ""
	startLoop()
end

local function disconnect()
	if state.token then
		task.spawn(request, "POST", "/api/plugin/disconnect")
	end
	stopLoop()
	state.token = nil
	plugin:SetSetting("BloxyToken", nil)
	setStatus("Disconnected")
	ui.button.Text = "Connect"
end

--------------------------------------------------------------------------------
-- UI
--------------------------------------------------------------------------------

local toolbar = plugin:CreateToolbar("Bloxy")
local toggleButton = toolbar:CreateButton("Bloxy", "Connect Studio to the Bloxy website", "rbxassetid://4458901886")
toggleButton.ClickableWhenViewportHidden = true

local widget = plugin:CreateDockWidgetPluginGui(
	"BloxyBridge",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 340, 560, 260, 320)
)
widget.Title = "Bloxy"

local function make(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local BG = Color3.fromRGB(24, 24, 28)
local FIELD = Color3.fromRGB(38, 38, 46)
local ACCENT = Color3.fromRGB(99, 102, 241)
local TEXT = Color3.fromRGB(230, 230, 235)

local root = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = BG, BorderSizePixel = 0 }, widget)
make("UIPadding", {
	PaddingTop = UDim.new(0, 12), PaddingBottom = UDim.new(0, 12),
	PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12),
}, root)
make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, root)

local function label(text, order)
	return make("TextLabel", {
		Text = text, LayoutOrder = order, Size = UDim2.new(1, 0, 0, 16), BackgroundTransparency = 1,
		TextColor3 = Color3.fromRGB(150, 150, 160), Font = Enum.Font.GothamMedium, TextSize = 12,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, root)
end

local function field(placeholder, order, text)
	local box = make("TextBox", {
		PlaceholderText = placeholder, Text = text or "", LayoutOrder = order, Size = UDim2.new(1, 0, 0, 32),
		BackgroundColor3 = FIELD, TextColor3 = TEXT, PlaceholderColor3 = Color3.fromRGB(110, 110, 120),
		Font = Enum.Font.Gotham, TextSize = 14, ClearTextOnFocus = false, BorderSizePixel = 0,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, root)
	make("UICorner", { CornerRadius = UDim.new(0, 6) }, box)
	make("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, box)
	return box
end

ui = {}
label("Website URL", 1)
ui.server = field(DEFAULT_SERVER, 2, state.server)
label("Pair code (shown on the website)", 3)
ui.code = field("ABC123", 4)
ui.button = make("TextButton", {
	Text = "Connect", LayoutOrder = 5, Size = UDim2.new(1, 0, 0, 34), BackgroundColor3 = ACCENT,
	TextColor3 = Color3.new(1, 1, 1), Font = Enum.Font.GothamBold, TextSize = 14, BorderSizePixel = 0,
	AutoButtonColor = true,
}, root)
make("UICorner", { CornerRadius = UDim.new(0, 6) }, ui.button)
ui.status = make("TextLabel", {
	Text = "Not connected", LayoutOrder = 6, Size = UDim2.new(1, 0, 0, 18), BackgroundTransparency = 1,
	TextColor3 = Color3.fromRGB(200, 200, 200), Font = Enum.Font.Gotham, TextSize = 13,
	TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd,
}, root)
ui.log = make("TextLabel", {
	Text = "", LayoutOrder = 7, Size = UDim2.new(1, 0, 1, -200), BackgroundTransparency = 1,
	TextColor3 = Color3.fromRGB(130, 130, 140), Font = Enum.Font.Code, TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top,
	TextWrapped = true, ClipsDescendants = true,
}, root)

--------------------------------------------------------------------------------
-- Chat: talk to Bloxy from inside Studio. Messages go through the website tab that is
-- paired with this Studio (it holds the model, key or bits), and replies stream back here.
--------------------------------------------------------------------------------

local TOOL_WORDS = {
	build_model = { "Building", "Built" },
	sculpt_model = { "Sculpting", "Sculpted" },
	generate_3d_model = { "Generating 3D model", "Generated" },
	search_knowledge = { "Looking it up", "Looked it up" },
	run_luau = { "Running Luau", "Ran Luau" },
	write_script = { "Writing", "Wrote" },
	edit_script = { "Editing", "Edited" },
	read_script = { "Reading", "Read" },
	create_instance = { "Creating", "Created" },
	set_properties = { "Editing", "Edited" },
	delete_instance = { "Deleting", "Deleted" },
	insert_parts = { "Building", "Built" },
	get_studio_state = { "Checking Studio", "Checked Studio" },
	search_instances = { "Searching", "Searched" },
	grep_scripts = { "Searching code", "Searched code" },
}

local chat = { jobId = nil, afterSeq = -1, loopId = 0, bubble = nil, tools = {}, order = 0, waiting = false }

ui.chat = make("Frame", {
	LayoutOrder = 8, Size = UDim2.new(1, 0, 1, -76), BackgroundTransparency = 1, Visible = false,
}, root)
ui.messages = make("ScrollingFrame", {
	Size = UDim2.new(1, 0, 1, -46), BackgroundColor3 = Color3.fromRGB(18, 18, 22), BorderSizePixel = 0,
	ScrollBarThickness = 4, CanvasSize = UDim2.new(), AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollingDirection = Enum.ScrollingDirection.Y,
}, ui.chat)
make("UICorner", { CornerRadius = UDim.new(0, 8) }, ui.messages)
make("UIPadding", {
	PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8),
	PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8),
}, ui.messages)
make("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, ui.messages)
ui.input = make("TextBox", {
	PlaceholderText = "Ask Bloxy to build or script…", Text = "", Position = UDim2.new(0, 0, 1, -38),
	Size = UDim2.new(1, -64, 0, 38), BackgroundColor3 = FIELD, TextColor3 = TEXT,
	PlaceholderColor3 = Color3.fromRGB(110, 110, 120), Font = Enum.Font.Gotham, TextSize = 14,
	ClearTextOnFocus = false, BorderSizePixel = 0, TextXAlignment = Enum.TextXAlignment.Left, TextWrapped = true,
}, ui.chat)
make("UICorner", { CornerRadius = UDim.new(0, 8) }, ui.input)
make("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, ui.input)
ui.send = make("TextButton", {
	Text = "Send", Position = UDim2.new(1, -58, 1, -38), Size = UDim2.new(0, 58, 0, 38),
	BackgroundColor3 = ACCENT, TextColor3 = Color3.new(1, 1, 1), Font = Enum.Font.GothamBold, TextSize = 14,
	BorderSizePixel = 0,
}, ui.chat)
make("UICorner", { CornerRadius = UDim.new(0, 8) }, ui.send)

local function nextOrder()
	chat.order += 1
	return chat.order
end

local function scrollDown()
	task.defer(function()
		ui.messages.CanvasPosition = Vector2.new(0, math.max(0, ui.messages.AbsoluteCanvasSize.Y))
	end)
end

local function addLine(text, kind)
	local isUser = kind == "user"
	local holder = make("Frame", {
		LayoutOrder = nextOrder(), Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
	}, ui.messages)
	local lbl = make("TextLabel", {
		Text = text, Size = UDim2.new(isUser and 0.85 or 1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
		Position = UDim2.fromScale(isUser and 0.15 or 0, 0),
		BackgroundColor3 = isUser and ACCENT or Color3.fromRGB(32, 32, 40),
		BackgroundTransparency = (kind == "tool" or kind == "note") and 1 or 0,
		TextColor3 = kind == "tool" and Color3.fromRGB(140, 150, 175)
			or kind == "error" and Color3.fromRGB(255, 120, 120)
			or kind == "note" and Color3.fromRGB(150, 150, 160)
			or TEXT,
		Font = kind == "tool" and Enum.Font.GothamMedium or Enum.Font.Gotham, TextSize = kind == "tool" and 12 or 13,
		TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top,
		BorderSizePixel = 0,
	}, holder)
	make("UICorner", { CornerRadius = UDim.new(0, 8) }, lbl)
	if kind ~= "tool" and kind ~= "note" then
		make("UIPadding", {
			PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6),
			PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8),
		}, lbl)
	end
	scrollDown()
	return lbl
end

local function toolText(name, target, status)
	local words = TOOL_WORDS[name] or { name, name }
	local suffix = (target and target ~= "") and (" " .. target) or ""
	if status == "running" then
		return "⋯ " .. words[1] .. suffix
	end
	return (status and "✓ " or "✗ ") .. words[2] .. suffix
end

local function applyEvent(event)
	local t = event.type
	if t == "user" then
		chat.bubble = nil
		chat.waiting = false
		addLine(tostring(event.content or ""), "user")
	elseif t == "text" then
		if not chat.bubble then
			chat.bubble = addLine("", "assistant")
		end
		chat.bubble.Text = (chat.bubble.Text .. tostring(event.delta or "")):gsub("^%s+", "")
		scrollDown()
	elseif t == "tool_call" then
		chat.bubble = nil
		chat.tools[event.id] = { line = addLine(toolText(event.name, event.target, "running"), "tool"), name = event.name, target = event.target }
	elseif t == "tool_result" then
		local tool = chat.tools[event.id]
		if tool then
			tool.line.Text = toolText(tool.name, tool.target, event.ok == true)
		end
	elseif t == "mesh" or t == "build" then
		addLine("Placed " .. tostring(event.name or "a model") .. " in your Bloxy workspace (download the .glb there to import it).", "note")
	elseif t == "error" then
		chat.bubble = nil
		addLine(tostring(event.message or "Something went wrong."), "error")
	end
end

local function stopChat()
	chat.loopId += 1
	ui.chat.Visible = false
end

local function startChat()
	stopChat()
	local myId = chat.loopId
	ui.chat.Visible = true
	task.spawn(function()
		while chat.loopId == myId do
			local route = "/api/plugin/chat?afterSeq=" .. tostring(chat.afterSeq)
			if chat.jobId then
				route ..= "&jobId=" .. HttpService:UrlEncode(chat.jobId)
			end
			local res, data = request("GET", route)
			if chat.loopId ~= myId then
				break
			end
			if res and res.Success and typeof(data) == "table" and data.jobId then
				if data.jobId ~= chat.jobId then
					chat.jobId = data.jobId
					chat.afterSeq = -1
				end
				for _, entry in ipairs(data.events or {}) do
					if entry.seq > chat.afterSeq then
						chat.afterSeq = entry.seq
						applyEvent(entry.event)
					end
				end
			end
			task.wait(1)
		end
	end)
end

local function sendChat()
	local text = ui.input.Text:gsub("^%s+", ""):gsub("%s+$", "")
	if text == "" or not state.connected then
		return
	end
	ui.input.Text = ""
	local res = request("POST", "/api/plugin/chat", { text = text })
	if not res or not res.Success then
		addLine("Couldn't send. Is the Bloxy website still running?", "error")
		return
	end
	chat.waiting = true
	local sentAt = os.clock()
	task.delay(8, function()
		if chat.waiting and os.clock() - sentAt >= 7.5 then
			addLine("Waiting for the Bloxy tab… keep bloxy open in your browser (Studio or Chat page) to run messages.", "note")
		end
	end)
end

ui.send.MouseButton1Click:Connect(sendChat)
ui.input.FocusLost:Connect(function(enterPressed)
	if enterPressed then
		sendChat()
	end
end)

-- Paired: the pairing fields give their space to the chat.
local pairingRows = { ui.server, ui.code, ui.log }
for _, child in ipairs(root:GetChildren()) do
	if child:IsA("TextLabel") and (child.LayoutOrder == 1 or child.LayoutOrder == 3) then
		table.insert(pairingRows, child)
	end
end
local function showChat(on)
	for _, row in ipairs(pairingRows) do
		row.Visible = not on
	end
	if on then
		startChat()
	else
		stopChat()
	end
end

state.onConnection = showChat

ui.button.MouseButton1Click:Connect(function()
	if state.connected then
		disconnect()
	else
		local code = ui.code.Text:gsub("%s", ""):upper()
		if code == "" then
			setStatus("Enter the pair code from the website", Color3.fromRGB(255, 170, 60))
			return
		end
		connectWithCode(code)
	end
end)

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	toggleButton:SetActive(widget.Enabled)
end)

plugin.Unloading:Connect(stopLoop)

-- Resume a previous pairing automatically.
if state.token then
	startLoop()
end
