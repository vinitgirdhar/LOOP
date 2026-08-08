'use client';

import { use } from 'react';
import { ChatWorkspace } from '@/components/chat/chat-workspace';

export default function ChatPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return <ChatWorkspace workspaceId={workspaceId} />;
}
