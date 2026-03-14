import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchModelPricingMap, PricingClientError } from "@/lib/openrouter/pricing-client";
import { MODEL_CATALOG } from "@/lib/models/catalog";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pricingMap = await fetchModelPricingMap();

    const pricingByModel = Object.fromEntries(
      MODEL_CATALOG.map((model) => {
        const pricing = pricingMap[model.value];
        return [
          model.value,
          pricing
            ? {
                prompt: pricing.prompt,
                completion: pricing.completion,
                request: pricing.request,
              }
            : null,
        ];
      })
    );

    return NextResponse.json(
      {
        pricingStatus: "live",
        pricingByModel,
      },
      { status: 200 }
    );
  } catch (error) {
    const pricingError =
      error instanceof PricingClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch model pricing.";

    return NextResponse.json(
      {
        pricingStatus: "unavailable",
        pricingByModel: {},
        pricingError,
      },
      { status: 200 }
    );
  }
}
