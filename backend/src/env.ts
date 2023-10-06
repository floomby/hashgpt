import * as z from "zod";
import { config } from "dotenv";

config({ path: "../.env" });

const schema = z.object({
  MOCK_LLM: z.coerce.boolean(),
  OPENAI_API_KEY: z.string(),
  ROUND_TIME: z.number().positive().int(),
  PORT: z.number().int().positive().min(1).max(65535),
  ADMIN_TOKEN: z.string(),
  USE_CORS: z.coerce.boolean(),
});

const env = {
  ...process.env,
  ROUND_TIME: Number(process.env.ROUND_TIME),
  PORT: Number(process.env.PORT),
};

export default schema.parse(env);
