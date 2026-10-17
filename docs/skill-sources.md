# Where Bloxy's skill packs come from

Bloxy's AI loads short skill packs (`src/lib/skills.ts`) when a request needs them. They are
written in our own words and condensed for an AI prompt. Thanks to these projects, whose work
they were learned from:

| Source | Licence | Used for |
| --- | --- | --- |
| [TabooHarmony/roblox-brain](https://github.com/TabooHarmony/roblox-brain) | MIT | Luau, architecture, networking, security, saves, performance, GUI, physics, NPCs, animation, lighting, game design, monetization |
| [AshExplained/roblox-skills](https://github.com/AshExplained/roblox-skills) | MIT | Debugging method, game UX, genre patterns, combat |
| [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) | MIT | Blender 5.x scripting, sculpting, hard-surface, PBR and Roblox budgets |
| [SyphoDev-yt/roblox-ai-skills](https://github.com/SyphoDev-yt/roblox-ai-skills) | SyphoDev free licence | Facts only (3D model, map and texture pipelines); no text copied |
| [brockmartin/roblox-game-skill](https://github.com/brockmartin/roblox-game-skill) | none stated | Facts only (common failure modes); no text copied |
| [sentinelcore/roblox-skills](https://github.com/sentinelcore/roblox-skills) | none stated | Facts only; no text copied |
| [YipengGao/3DCode](https://huggingface.co/datasets/YipengGao/3DCode) | see `data/3dcode/NOTICE.md` | Example Blender scripts for 3D generation |

MIT licence notices for the MIT projects are reproduced in each project's repository.
