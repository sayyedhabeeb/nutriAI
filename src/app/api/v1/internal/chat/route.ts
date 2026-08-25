import { NextRequest } from "next/server";
import { validateServiceToken } from "@/lib/auth/serviceAuth";
import { processChat } from "@/lib/chat-engine";
import { success, error } from "@/lib/response";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const authResult = await validateServiceToken(request);
  if (authResult.error || !authResult.user) {
    return error("Unauthorized", 401, "INVALID_TOKEN");
  }

  try {
    const body = await request.json();
    const { message, conversationId, contextData } = body;

    if (!message || typeof message !== "string") {
      return error("Message is required", 400);
    }
    if (message.length > 1000) {
      return error("Message exceeds maximum length of 1000 characters", 400);
    }

    const result = await processChat(
      authResult.user.id,
      conversationId || null,
      message,
      contextData || {}
    );

    return success(result);
  } catch (err: any) {
    console.error("[Chat Route] Error:", err);
    if (err.message === "Conversation not found or access denied") {
      return error(err.message, 403);
    }
    return error(err.message || "Internal server error", 500);
  }
}
