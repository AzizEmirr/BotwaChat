export type ChatMessageDTO = {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
};

export type SendMessageDTO = {
  channelId: string;
  content: string;
};
