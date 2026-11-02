import { buildTopics, type HelpTopic } from './help';

// The guide is bundled into the app at build time from docs/guide.
const files = import.meta.glob('../../../../../../docs/guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const HELP_TOPICS: HelpTopic[] = buildTopics(files);

export const findTopic = (id: string) => HELP_TOPICS.find((t) => t.id === id);
