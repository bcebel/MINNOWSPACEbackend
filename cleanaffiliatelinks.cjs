// cleanaffiliatelinks-simple.cjs
import Usery from "./structure/models/User.js";

require("dotenv").config();
const mongoose = require("mongoose");

// Extract URLs from CJ.com HTML
function extractAffiliateData(rawHtml) {
  try {
    if (!rawHtml || typeof rawHtml !== "string") return null;

    // Remove HTML and extract URLs
    const urlRegex = /https?:\/\/[^\s"']+/gi;
    const allUrls = rawHtml.match(urlRegex) || [];

    // Filter for CJ.com URLs
    const cjDomains = [
      "tkqlhce.com",
      "anrdoezrs.net",
      "jdoqocy.com",
      "tqlkg.com",
      "ftjcfx.com",
      "awltovhc.com",
      "kqzyfj.com",
    ];

    const cjUrls = allUrls.filter((url) =>
      cjDomains.some((domain) => url.includes(domain))
    );

    if (cjUrls.length >= 1) {
      // First URL is the click tracker
      return {
        clickUrl: cjUrls[0],
        imageUrl: cjUrls[1] || null,
        title: extractTitle(rawHtml),
        description: extractDescription(rawHtml),
      };
    }

    return null;
  } catch (error) {
    console.error("Failed to parse affiliate HTML:", error.message);
    return null;
  }
}

function extractTitle(html) {
  try {
    const altMatch = html.match(/alt="([^"]*)"/);
    const titleMatch = html.match(/title="([^"]*)"/);
    return altMatch?.[1] || titleMatch?.[1] || "Affiliate Link";
  } catch {
    return "Affiliate Link";
  }
}

function extractDescription(html) {
  try {
    const text = html.replace(/<[^>]*>/g, " ").trim();
    return text.length > 200 ? text.substring(0, 200) + "..." : text;
  } catch {
    return "";
  }
}

async function migrateAffiliateLinks() {

  // Dynamically import User model (check both .cjs and .js)
  let User;
  try {
    Usery ;
  } catch {
    Usery ;
  }

  const users = await User.find({ "affiliateLinks.0": { $exists: true } });


  let totalCleaned = 0;
  let totalFailed = 0;

  for (const user of users) {
    try {
      const cleanedLinks = [];
      const userLinks = user.affiliateLinks || [];



      for (const rawLink of userLinks) {
        try {
          // If it's already a clean object with URL, keep it
          if (rawLink && typeof rawLink === "object" && rawLink.url) {
            cleanedLinks.push({
              url: rawLink.url,
              title: rawLink.title || "",
              description: rawLink.description || "",
              imageUrl: rawLink.imageUrl || null,
              clicks: rawLink.clicks || 0,
            });
            continue;
          }

          // Try to parse as HTML
          let html = "";
          if (typeof rawLink === "string") {
            html = rawLink;
          } else if (rawLink && typeof rawLink === "object") {
            // Try various possible properties
            html = rawLink.html || rawLink.content || "";
          }

          if (html && html.includes("http")) {
            const cleaned = extractAffiliateData(html);

            if (cleaned && cleaned.clickUrl) {
              cleanedLinks.push({
                url: cleaned.clickUrl,
                title: cleaned.title,
                description: cleaned.description,
                imageUrl: cleaned.imageUrl,
                clicks: rawLink.clicks || 0,
              });

            } else {
              totalFailed++;
            }
          } else {
            totalFailed++;
          }
        } catch (linkError) {
          totalFailed++;
        }
      }

      // Only save if changes were made
      const needsUpdate =
        JSON.stringify(user.affiliateLinks) !== JSON.stringify(cleanedLinks);

      if (needsUpdate) {
        user.affiliateLinks = cleanedLinks;
        await user.save();
        totalCleaned += cleanedLinks.length;
      } else {
      }
    } catch (userError) {
      console.error(
        `Failed to process user ${user.username}:`,
        userError.message
      );
    }
  }


  return { totalCleaned, totalFailed };
}

async function runMigration() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/minnowbe",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );


    await migrateAffiliateLinks();


    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Handle cleanup
process.on("SIGINT", async () => {
  await mongoose.disconnect();
  process.exit(0);
});

runMigration();
