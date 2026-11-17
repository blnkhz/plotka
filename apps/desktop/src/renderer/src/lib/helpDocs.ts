import { buildTopics, type HelpTopic } from './help';
import { keyText } from './keys';

// The guide is bundled into the app at build time from docs/guide.
const files = import.meta.glob('../../../../../../docs/guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// The guide is written with macOS key symbols; elsewhere they read Ctrl+S and so on.
export const HELP_TOPICS: HelpTopic[] = buildTopics(
  Object.fromEntries(Object.entries(files).map(([f, md]) => [f, keyText(md)])),
);

export const findTopic = (id: string) => HELP_TOPICS.find((t) => t.id === id);
