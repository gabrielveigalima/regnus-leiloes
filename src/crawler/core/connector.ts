import { z } from "zod";

export const NormalizedListingSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string().nullish(),
  seller: z.string().nullish(),
  auctionType: z.enum(["JUDICIAL", "EXTRAJUDICIAL", "DIRECT_SALE", "LICITACAO_ABERTA"]).default("EXTRAJUDICIAL"),
  status: z.enum(["UPCOMING", "OPEN", "CLOSED", "SOLD", "SUSPENDED", "CANCELLED"]).default("OPEN"),
  appraisalValue: z.number().nonnegative().nullish(),
  minBid: z.number().nonnegative().nullish(),
  caseNumber: z.string().nullish(),
  noticeUrl: z.string().url().nullish(),
  acceptsFinancing: z.boolean().default(false),
  acceptsFgts: z.boolean().default(false),
  property: z.object({
    type: z.enum(["APARTMENT", "HOUSE", "LAND", "COMMERCIAL", "RURAL", "OTHER"]).default("OTHER"),
    street: z.string().nullish(), number: z.string().nullish(), complement: z.string().nullish(),
    neighborhood: z.string().nullish(), city: z.string().nullish(), uf: z.string().length(2).nullish(),
    zip: z.string().nullish(),
    privateArea: z.number().nullish(), totalArea: z.number().nullish(), landArea: z.number().nullish(),
    bedrooms: z.number().int().nullish(), parking: z.number().int().nullish(),
    registry: z.string().nullish(), registryOffice: z.string().nullish(),
    occupation: z.enum(["OCCUPIED", "UNOCCUPIED", "UNKNOWN"]).default("UNKNOWN"),
  }),
  rounds: z.array(z.object({ number: z.number().int().positive(), date: z.date().nullish(), minBid: z.number().nullish() })).default([]),
  images: z.array(z.string().url()).default([]),
});
export type NormalizedListing = z.infer<typeof NormalizedListingSchema>;

export interface ListingRef { externalId: string; url: string; data?: unknown }
export type RawListing = { ref: ListingRef; body: string | unknown };

export interface CrawlContext {
  http: import("./http").HttpClient;
  filters: { uf?: string; limit?: number };
  log: (msg: string) => void;
}

export interface Connector {
  /** = Source.id */
  id: string;
  discover(ctx: CrawlContext): AsyncIterable<ListingRef>;
  fetchDetail?(ref: ListingRef, ctx: CrawlContext): Promise<RawListing>;
  /** Puro e testável com fixtures; deve validar com NormalizedListingSchema. */
  parse(raw: RawListing): NormalizedListing;
}
