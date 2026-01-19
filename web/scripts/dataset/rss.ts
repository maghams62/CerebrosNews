import Parser from "rss-parser";

const parser = new Parser();

export type ParsedFeed = {
  title?: string;
  items: Array<Record<string, unknown>>;
};

export async function parseRss(xml: string): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  return {
    title: feed.title,
    items: (feed.items ?? []) as Array<Record<string, unknown>>,
  };
}

