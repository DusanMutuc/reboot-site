export type PodcastEpisode = {
  id: string;
  title: string;
  summary: string | null;
  descriptionHtml: string | null;
  durationSeconds: number | null;
  durationLabel: string | null;
  publishedAt: string | null;
  publishedLabel: string | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  imageUrl: string | null;
  mediaUrl: string | null;
  playerUrl: string | null;
  shareUrl: string | null;
};

export type PodcastEpisodesResponse = {
  episodes: PodcastEpisode[];
};
