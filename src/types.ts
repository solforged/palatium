export interface Wing {
  name: string;
  gloss: string;
  dates: string;
  hook: string;
  color: string;
}

export interface Locus {
  id: string;
  /** Index into `Palace.wings`. Loci must be grouped by wing, in walking order. */
  wing: number;
  answer: string;
  dates: string;
  hook: string;
  scene: string;
  facts: string[];
  /** Image file name, relative to the palace directory. */
  image: string;
}

export interface Palace {
  id: string;
  title: string;
  subject: string;
  prompt: string;
  style: string;
  wings: Wing[];
  loci: Locus[];
}
