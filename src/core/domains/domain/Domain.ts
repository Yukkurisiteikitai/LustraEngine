export const VALID_DOMAINS = ['WORK', 'RELATIONSHIP', 'HEALTH', 'MONEY', 'SELF'] as const;
export type Domain = (typeof VALID_DOMAINS)[number];
