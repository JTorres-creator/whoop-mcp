import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhoopClient } from "../whoop-client";

export function registerHealthspanTools(
  server: McpServer,
  whoopClient: WhoopClient
) {
  server.registerTool(
    "whoop_get_healthspan",
    {
      title: "Get Whoop Healthspan (Biological Age)",
      description:
        "Get comprehensive healthspan analysis including WHOOP Age (biological age), pace of aging, and comparison to chronological age",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe(
            "Date in YYYY-MM-DD format (defaults to today if not provided)"
          ),
      },
      outputSchema: {
        navigationTitle: z.string().nullable(),
        navigationSubtitle: z.string().nullable(),
        dateRange: z.string().nullable(),
        isCalibrating: z.boolean(),
        currentPeriod: z.object({
          whoopAge: z.string().nullable(),
          ageStatus: z.string().nullable(),
          yearsDifference: z.string().nullable(),
          paceOfAging: z.string().nullable(),
        }),
        previousPeriod: z.object({
          whoopAge: z.string().nullable(),
          paceOfAging: z.string().nullable(),
        }),
      },
    },
    async ({ date }) => {
      try {
        const data = await whoopClient.getHealthspan(date);

        const unlockedContent = data.unlocked_content;
        const currentAmoeba = unlockedContent.whoop_age_amoeba;
        const previousAmoeba = unlockedContent.previous_whoop_age_amoeba;

        const output = {
          navigationTitle: data.navigation_title,
          navigationSubtitle: data.navigation_subtitle,
          dateRange: unlockedContent.date_picker.current_date_range_display,
          isCalibrating: unlockedContent.is_calibrating,
          currentPeriod: {
            whoopAge: currentAmoeba.age_value_display,
            ageStatus: currentAmoeba.age_subtitle_display,
            yearsDifference: currentAmoeba.years_difference_value_display,
            paceOfAging: currentAmoeba.pace_of_aging_display,
          },
          previousPeriod: {
            whoopAge: previousAmoeba.age_value_display,
            paceOfAging: previousAmoeba.pace_of_aging_display,
          },
        };

        const lines = [
          "🧬 HEALTHSPAN (WHOOP AGE)",
          "═══════════════════════",
          "",
          `📅 Period: ${output.dateRange}`,
          `⏰ ${output.navigationSubtitle}`,
          "",
        ];

        if (output.isCalibrating) {
          lines.push(
            "⚙️  CALIBRATING",
            "   Your Healthspan is currently being calculated...",
            ""
          );
        } else {
          lines.push(
            "🎯 CURRENT PERIOD",
            "─────────────────",
            `  WHOOP Age: ${output.currentPeriod.whoopAge}`,
            `  Status: ${output.currentPeriod.ageStatus}`,
            `  Years Difference: ${output.currentPeriod.yearsDifference}`,
            `  Pace of Aging: ${output.currentPeriod.paceOfAging}`,
            "",
            "📊 PREVIOUS PERIOD",
            "──────────────────",
            `  WHOOP Age: ${output.previousPeriod.whoopAge}`,
            `  Pace of Aging: ${output.previousPeriod.paceOfAging}`,
            ""
          );

          const paceValue = parseFloat(
            output.currentPeriod.paceOfAging.replace("x", "")
          );
          if (!isNaN(paceValue)) {
            lines.push("💡 INTERPRETATION", "─────────────────");
            if (paceValue < 1.0) {
              lines.push(
                `  You're aging slower than average (${output.currentPeriod.paceOfAging})`,
                `  This means you're gaining less than 1 biological year per chronological year.`,
                ""
              );
            } else if (paceValue === 1.0) {
              lines.push(
                `  You're aging at an average pace (${output.currentPeriod.paceOfAging})`,
                `  This means you're gaining 1 biological year per chronological year.`,
                ""
              );
            } else {
              lines.push(
                `  You're aging faster than average (${output.currentPeriod.paceOfAging})`,
                `  This means you're gaining more than 1 biological year per chronological year.`,
                ""
              );
            }
          }
        }

        const formattedText = lines.join("\n");

        return {
          content: [{ type: "text", text: formattedText }],
          structuredContent: output,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text",
              text: `Error fetching Whoop healthspan data: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
