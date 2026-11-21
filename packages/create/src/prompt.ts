import { createInterface } from "node:readline/promises";

/** Questions on the terminal; only used when stdin is one. */
export function createPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    async text(question: string, fallback = ""): Promise<string> {
      const hint = fallback ? ` (${fallback})` : "";
      const answer = (await rl.question(`? ${question}${hint} `)).trim();
      return answer || fallback;
    },
    async choose<T extends string>(
      question: string,
      choices: Record<T, string>,
    ): Promise<T> {
      const keys = Object.keys(choices) as T[];
      console.log(`? ${question}`);
      for (const [index, key] of keys.entries())
        console.log(`  ${index + 1}. ${choices[key]}`);
      for (;;) {
        const answer = (
          await rl.question(`  Choose 1-${keys.length} (1) `)
        ).trim();
        const index = answer ? Number(answer) - 1 : 0;
        const key = keys[index];
        if (key) return key;
      }
    },
    async confirm(question: string, fallback = true): Promise<boolean> {
      const answer = (
        await rl.question(`? ${question} (${fallback ? "Y/n" : "y/N"}) `)
      )
        .trim()
        .toLowerCase();
      return answer ? answer.startsWith("y") : fallback;
    },
    close: () => rl.close(),
  };
}
