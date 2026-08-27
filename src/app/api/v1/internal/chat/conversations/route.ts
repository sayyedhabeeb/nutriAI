import { NextRequest } from "next/server";
import { validateServiceToken } from "@/lib/auth/serviceAuth";
import { success, error } from "@/lib/response";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const authResult = await validateServiceToken(request);
  if (authResult.error || !authResult.user) {
    return error("Unauthorized", 401, "INVALID_TOKEN");
  }

  try {
    const conversations = await db.aiConversation.findMany({
      where: { userId: authResult.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return success(conversations);
  } catch (err: any) {
    console.error("[Chat Conversations Route] Error:", err);
    return error("Internal server error", 500);
  }
}
