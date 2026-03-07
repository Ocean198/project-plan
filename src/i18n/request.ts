import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  // Locale aus Cookie lesen (wird beim Locale-Wechsel gesetzt)
  // Fallback: "de"
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as "de" | "en") ?? "de";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
