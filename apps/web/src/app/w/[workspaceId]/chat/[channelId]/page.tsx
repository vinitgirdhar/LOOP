'use client';

import { use } from 'react';
import { ChatWorkspace } from '@/components/chat/chat-workspace';

export default function ChannelPage({ params }: { params: Promise<{ workspaceId: string; channelId: string }> }) {
  const { workspaceId, channelId } = use(params);
  return <ChatWorkspace workspaceId={workspaceId} channelId={channelId} />;
}
