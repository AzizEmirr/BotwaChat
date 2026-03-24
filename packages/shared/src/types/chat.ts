export type ChannelType = "text" | "announcement";

export type Channel = {
  id: string;
  workspaceId: string;
  name: string;
  kind: ChannelType;
};
