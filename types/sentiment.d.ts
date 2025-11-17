declare module 'sentiment' {
  export interface SentimentResult {
    score: number;
    comparative: number;
    calculation: Array<{ [word: string]: number }>;
    tokens: string[];
    words: string[];
    positive: string[];
    negative: string[];
  }

  export default class Sentiment {
    constructor();
    analyze(phrase: string, options?: any, callback?: Function): SentimentResult;
  }
}
