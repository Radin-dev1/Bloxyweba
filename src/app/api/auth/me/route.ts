import { authConfigured, currentUser, isAdmin } from "@/lib/auth";
import { BITS_DAILY, balanceOf, bitsEnabled } from "@/lib/bits";

/** Who's signed in and how many bits they have, for the header. */
export async function GET() {
  const user = await currentUser();
  const enabled = bitsEnabled();
  return Response.json(
    {
      user,
      bits: user && enabled ? await balanceOf(user.id) : null,
      daily: BITS_DAILY,
      bitsEnabled: enabled,
      signInEnabled: authConfigured(),
      admin: isAdmin(user),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
