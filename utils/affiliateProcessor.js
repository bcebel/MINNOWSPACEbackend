// utils/affiliateProcessor.js

// Extract URLs from CJ.com HTML
function extractAffiliateData(rawHtml) {
  try {
    // Remove HTML and extract URLs
    const urlRegex = /https?:\/\/[^\s"']+/gi;
    const allUrls = rawHtml.match(urlRegex) || [];

    // Filter for CJ.com URLs
    const cjUrls = allUrls.filter(
      (url) =>
        url.includes("tkqlhce.com") ||
        url.includes("anrdoezrs.net") ||
        url.includes("jdoqocy.com") ||
        url.includes("tqlkg.com") ||
        url.includes("ftjcfx.com") ||
        url.includes("awltovhc.com") ||
        url.includes("kqzyfj.com")
    );

    if (cjUrls.length >= 2) {
      // First URL is usually the click tracker
      // Second URL is the image (if any)
      return {
        clickUrl: cjUrls[0],
        imageUrl: cjUrls[1] || null,
        title: extractTitle(rawHtml),
        description: extractDescription(rawHtml),
      };
    }

    return null;
  } catch (error) {
    console.error("Failed to parse affiliate HTML:", error);
    return null;
  }
}

function extractTitle(html) {
  // Extract from <img alt="..."> or <a title="...">
  const altMatch = html.match(/alt="([^"]*)"/);
  const titleMatch = html.match(/title="([^"]*)"/);
  return altMatch?.[1] || titleMatch?.[1] || "Affiliate Link";
}

function extractDescription(html) {
  // Extract text between tags
  const text = html.replace(/<[^>]*>/g, " ").trim();
  return text.length > 200 ? text.substring(0, 200) + "..." : text;
}

// Migration: Process existing affiliate links
async function migrateAffiliateLinks() {
  console.log("Migrating affiliate links...");

  const users = await User.find({ "affiliateLinks.0": { $exists: true } });

  for (const user of users) {
    const cleanedLinks = [];

    for (const rawLink of user.affiliateLinks) {
      // If it's already a clean object, keep it
      if (typeof rawLink === "object" && rawLink.url) {
        cleanedLinks.push(rawLink);
        continue;
      }

      // If it's HTML, process it
      if (typeof rawLink === "string" || rawLink.html) {
        const html = typeof rawLink === "string" ? rawLink : rawLink.html;
        const cleaned = extractAffiliateData(html);

        if (cleaned) {
          cleanedLinks.push({
            url: cleaned.clickUrl,
            title: cleaned.title,
            description: cleaned.description,
            imageUrl: cleaned.imageUrl,
            clicks: rawLink.clicks || 0,
          });
        }
      }
    }

    user.affiliateLinks = cleanedLinks;
    await user.save();
    console.log(
      `Migrated ${cleanedLinks.length} links for user ${user.username}`
    );
  }

  console.log("Migration complete!");
}

module.exports = {
  extractAffiliateData,
  migrateAffiliateLinks,
};
