export const getEnvVariable = (varName: string) => {
  const value = Deno.env.get(varName);
  if (!value) {
    throw new Error(`Environment variable ${varName} is not set`);
  }
  return value;
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
