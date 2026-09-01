import { NextRequest } from "next/server";
import { validateServiceToken } from "@/lib/auth/serviceAuth";
import { success, error } from "@/lib/response";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const authResult = await validateServiceToken(request);
  if (authResult.error || !authResult.user) {
    return error("Unauthorized", 401, "INVALID_TOKEN");
  }

  try {
    const params = await props.params;
    const conversation = await db.aiConversation.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!conversation || conversation.userId !== authResult.user.id) {
      return error("Conversation not found", 404);
    }

    return success(conversation);
  } catch (err: any) {
    console.error("[Chat Messages Route] Error:", err);
    return error("Internal server error", 500);
  }
}
