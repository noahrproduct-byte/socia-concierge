# Raw social-data API vendors for Instagram public-account and Reels data (as of 2026-11-01)

Scope: vendors SOCIA could buy competitor Instagram data from for a "Discover" feature (niche -> suggested competitor accounts -> their recent Reels with views, likes, comments, date, caption). SOCIA does no scraping itself. Pages were read on 2026-11-01 unless a date is given. Anything not confirmed on a primary source is marked UNVERIFIED.

## How each vendor gets Instagram data (logged-out public vs logged-in accounts/cookies)

### Takeaway
Apify's official actors say outright that they read the logged-out page, and Data365 says the same in different words. Bright Data bans data behind a login in its acceptable-use policy and won a court case built on logged-out scraping. EnsembleData and ScrapeCreators say only "public data" and do not say how they collect it. HikerAPI calls itself an "Unofficial Mobile API". PhantomBuster runs on the customer's own Instagram session cookie, which rules it out for SOCIA.

### Cited Findings
- Apify Instagram Scraper (maintained by Apify itself): "The Actor sees the logged-out version of the page"; "No Business or Creator account, no OAuth, no limits on public data"; "only collects data that is publicly available on Instagram. It does not access private content." — [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper)
- Apify Instagram Reel Scraper (maintained by Apify): "The Actor scrapes public data, so it gets the same counts Instagram shows a visitor who isn't signed in." — [Apify Reel Scraper](https://apify.com/apify/instagram-reel-scraper)
- Apify Hashtag Scraper (maintained by Apify): "This Actor only collects public data available on Instagram" and "does not access private accounts or private content". It says nothing about login. — [Apify Hashtag Scraper](https://apify.com/apify/instagram-hashtag-scraper)
- Apify warns that "some public data may be considered personal data under regulations like the GDPR" and says "Only scrape data if you have a legitimate reason." — [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper)
- Bright Data: its acceptable-use policy forbids "Collection of nonpublic information (i.e data behind login)" (policy last modified 2025-06-04). — [Bright Data AUP](https://brightdata.com/acceptable-use-policy). The scraper page says "Only publicly available data" but does not explicitly say it never logs in. — [Bright Data Instagram scraper](https://brightdata.com/products/web-scraper/instagram)
- Bright Data datasets: "All data is collected from publicly available sources in line with GDPR and CCPA." — [Bright Data Instagram datasets](https://brightdata.com/products/datasets/instagram)
- Data365: "We provide any public info that doesn't require login"; "Any publicly available data from the social network's web version can be accessed." — [Data365 Instagram](https://data365.co/instagram)
- EnsembleData: "All endpoints fetch public data"; "You don't need a Instagram account to use our API"; "Every request triggers a live scrape." The second quote is about the customer not needing an account. It does not say how EnsembleData itself collects. — [EnsembleData Instagram API](https://ensembledata.com/instagram-api)
- ScrapeCreators: the docs say "Only public data extraction"; the terms say the service helps "retrieve publicly available information from third-party websites". Neither page mentions login or cookies. — [ScrapeCreators docs](https://docs.scrapecreators.com/); [ScrapeCreators terms](https://scrapecreators.com/terms)
- HikerAPI: calls itself an "Unofficial Instagram REST API" and an "Unofficial Mobile API" with "no authentication required, no session management" (for the customer), and says it "returns public data and never acts on an account". The docs do not say how the mobile-API access works. — [HikerAPI](https://hikerapi.com/)
- PhantomBuster: the Instagram Profile Scraper connects with the customer's own Instagram session cookie and is limited to 100 profiles a day, spread across 1 launch per hour. — [PhantomBuster Instagram Profile Scraper](https://phantombuster.com/automations/instagram/7085/instagram-profile-scraper); [PhantomBuster tutorial](https://phantombuster.com/automations/instagram/7085/instagram-profile-scraper/tutorial). A third-party review warns the customer's personal account can be banned if it runs too fast. — [chat4data blog, 2026-03-30](https://chat4data.ai/blog/instagram-profile-scraper)

### Inferences
- Lowest-risk collection posture: Apify official actors, then Data365 and Bright Data (explicit no-login wording or policy).
- EnsembleData and ScrapeCreators need a written answer from the vendor ("do you ever use logged-in accounts, purchased accounts or customer cookies?") before SOCIA relies on them.
- HikerAPI's "Unofficial Mobile API" wording suggests access to Instagram's private mobile API. That API normally needs logged-in sessions, so HikerAPI probably holds accounts on its side. UNVERIFIED and high risk.
- PhantomBuster breaks SOCIA's rule against session or cookie automation and its volume cap is far too low. Exclude it.

### Gaps
- No vendor except Apify (logged-out view) says exactly how it avoids login. Bright Data's exact method today is not stated.
- The automation-lab community Apify actor reportedly says a logged-in session cookie may be required for some lookups (seen in a search snippet only; its changelog returned 404). UNVERIFIED.

## Endpoints and fields: profiles, recent Reels with view/play counts, hashtag/keyword/location search, related accounts

### Takeaway
Apify official (Reel Scraper plus Hashtag Scraper) covers everything SOCIA needs and documents play and view counts in its sample output. ScrapeCreators and HikerAPI have the widest search coverage. Nobody now offers related-account discovery from a confirmed source: Apify removed `relatedProfiles` in September 2026.

### Cited Findings
- Apify Instagram Scraper: profiles, posts, Reels, comments, mentions, hashtag details, place details, and keyword search for profiles, hashtags and places. The Reel sample includes `videoViewCount` and `videoPlayCount`. — [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper)
- Apify Reel Scraper fields: `videoPlayCount`, `videoViewCount`, `likesCount`, `commentsCount`, `caption`, `timestamp`; shares are a paid add-on. — [Apify Reel Scraper](https://apify.com/apify/instagram-reel-scraper)
- Apify Hashtag Scraper: hashtag or keyword mode (toggle "Scrape with a keyword instead of hashtag"); Reel results carry `videoPlayCount` and `igPlayCount`; likes can be -1 when hidden; hashtag results are recent posts and Reels; "Free usage covers just the first page of results." — [Apify Hashtag Scraper](https://apify.com/apify/instagram-hashtag-scraper)
- Apify changelog: `relatedProfiles` was removed from post metadata on 2026-09-14; "Hashtag search" was removed on 2024-10-09 (this appears to be the search mode, since the separate Hashtag Scraper still exists). — [Apify Instagram Scraper changelog](https://apify.com/apify/instagram-scraper/changelog)
- Bright Data scrapers: profiles, posts, Reels (from a profile or a search URL), comments. Hashtag is a separate product. The Reels description mentions "Views" but the sample output had no views field. — [Bright Data Instagram scraper](https://brightdata.com/products/web-scraper/instagram). The datasets page lists Views for Reels (109M+ Reel records). — [Bright Data datasets](https://brightdata.com/products/datasets/instagram)
- EnsembleData: User Info, User Posts, User Reels ("Reels Analytics"), Hashtag & Keyword Search, post details, comments, music trends, tagged content. No location or related-accounts endpoint is listed. — [EnsembleData Instagram API](https://ensembledata.com/instagram-api)
- ScrapeCreators: 20 endpoints, including Profile, Posts, Reels, Post/Reel Info, Search, Search Hashtag Posts, Search Profiles, Search Reels, Trending Reels, Reels by Audio ID and Transcript. No location or similar-accounts endpoint. — [ScrapeCreators docs](https://docs.scrapecreators.com/). The Reels endpoint notes "Play counts may be inaccurate and exclude Facebook views." — [ScrapeCreators Instagram API](https://scrapecreators.com/instagram-api)
- Data365: profiles, posts, media, comments, reactions; "20+ public data endpoints". Reel views, location and search are not named. — [Data365 Instagram](https://data365.co/instagram)
- HikerAPI: profile by username, user media, Reels and tagged posts, hashtag top and recent posts, location search with top and recent posts, user/place/hashtag search. Its Reels page mentions "view counts". — [HikerAPI](https://hikerapi.com/)
- Vendor blogs say logged-out native hashtag and keyword browsing was removed in 2024, and that Instagram sits behind Imperva bot scoring. — [Scrapfly](https://scrapfly.io/blog/posts/how-to-scrape-instagram); [Scrapeway, Sept 2026 benchmark](https://scrapeway.com/targets/instagram) (vendor content)

### Inferences
- Discovery by niche is feasible through hashtag or keyword search (Apify, ScrapeCreators, EnsembleData, HikerAPI) by grouping the post authors returned. No source offers a "similar accounts" endpoint, so SOCIA would rank candidate accounts itself.
- Location search is confirmed only at Apify (place details and place keyword search) and HikerAPI.
- View counts are "what a logged-out visitor sees" (Apify). ScrapeCreators warns that play counts can be inaccurate. SOCIA should label them as public counts, not reach.

### Gaps
- Bright Data's exact Reel field names (views or play count) are not confirmed; the docs URL returned 404.
- Data365's Instagram Reel view field is not confirmed.
- The most used RapidAPI-hosted Instagram API could not be confirmed: RapidAPI pages did not render. The social-api1 "Instagram Scraper API" (`instagram-scraper-api2`) showed a 9.9 popularity score in a cached snapshot. — [RapidAPI listing](https://rapidapi.com/tr/social-api1-instagram/api/instagram-scraper-api2/). Its subscriber count, endpoints and collection method are UNVERIFIED.

## Reliability claims, terms on compliance and redistribution, and pricing

### Takeaway
Every vendor puts legal compliance on the customer and makes no uptime promise that means much. None of the terms read explicitly forbids showing the data inside a customer's product, except EnsembleData's ban on building a competing data service. List prices run from about $0.60 to $2.70 per 1,000 results, with HikerAPI far cheaper per request.

### Cited Findings
- Apify terms (effective 2026-07-09): "You are solely responsible for the legality, accuracy, quality, appropriateness, and use of all Customer Data"; "We are not responsible for your privacy obligations or data security practices"; "Platform availability is not guaranteed"; the customer indemnifies Apify for using Actors "to extract Customer Data from unauthorized sources". No clause addresses redistributing scraped data. — [Apify general terms](https://docs.apify.com/legal/general-terms-and-conditions)
- EnsembleData terms (undated, footer 2026): "Clients are solely responsible for ensuring that their use of the APIs and Data complies with all applicable laws"; "Clients may not use the APIs or Data to create a product or service that competes directly with EnsembleData's services"; no warranty on Data; refund if the service is down more than three hours a day. — [EnsembleData terms](https://ensembledata.com/terms-and-conditions)
- ScrapeCreators terms (effective 2026-06-29): "You are solely responsible for ensuring your use of the Service complies with the terms" (of third parties); "We are not responsible for violations of third-party terms"; "We do not guarantee uptime or continuity"; no redistribution clause. — [ScrapeCreators terms](https://scrapecreators.com/terms)
- Bright Data AUP: services "are meant for legitimate and legal purposes only"; bans activity "in violation of applicable law or regulations or any third party rights". — [Bright Data AUP](https://brightdata.com/acceptable-use-policy)
- Data365 reviews intended use on an intro call "to ensure the API will be used responsibly"; "Data availability is subject to Instagram's evolving platform policies." — [Data365 Instagram](https://data365.co/instagram)
- Reliability claims (all vendor-stated): Apify Instagram Scraper shows "100.0% runs succeeded", 61,879 monthly users, 4.68/5; Reel Scraper 22,511 monthly users, 4.39/5; Hashtag Scraper 18,729 monthly users, 3.49/5. — [Apify](https://apify.com/apify/instagram-scraper). Bright Data cites a 99.2% average success rate, platform-wide, not Instagram-specific. — [Bright Data](https://brightdata.com/products/web-scraper/instagram). ScrapeCreators shows a 98.2% success rate and 3.12 s average response time. — [ScrapeCreators](https://scrapecreators.com/). Data365 claims "uptime of at least 99%" and 1 to 5 minutes latency. — [Data365](https://data365.co/instagram)

Pricing:
- Apify Instagram Scraper (pay per result): Free $2.70, Starter $2.30, Scale $1.90, Business $1.50 per 1,000 results. — [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper). Reel Scraper: from $1.00 per 1,000 Reels (Free $2.60, Starter $2.30). — [Apify Reel Scraper](https://apify.com/apify/instagram-reel-scraper). Hashtag Scraper: from $1.90 per 1,000 (Free $2.60, Starter $2.30). — [Apify Hashtag Scraper](https://apify.com/apify/instagram-hashtag-scraper). Monthly plan fees were not on these pages (Starter is about $29 a month: UNVERIFIED).
- Bright Data scraper API: pay as you go $1.5 per 1,000 records; Scale $499 a month with 384,000 records included and $1.3 per 1,000 after that; 5K free records a month; "No upfront commitment". — [Bright Data](https://brightdata.com/products/web-scraper/instagram). Datasets: $250 per 100K records, $250 minimum order. — [Bright Data datasets](https://brightdata.com/products/datasets/instagram)
- EnsembleData (units per day): Wood $100 (1,500), Bronze $200 (5,000), Silver $400 (11,000), Gold $800 (25,000), Platinum $1,400 (50,000). Instagram User Info costs 3 units; User Posts and User Reels cost 1 unit per post; keyword search costs 1 unit per 20 posts. — [EnsembleData pricing](https://ensembledata.com/pricing). The platform mapping of unit rows was inferred from table position: UNVERIFIED.
- ScrapeCreators (prepaid credits, no subscription, credits never expire): Freelance $47 for 25,000 credits; Business $497 for 500,000 credits; 1 credit is typically 1 request, and errors cost 0. — [ScrapeCreators](https://scrapecreators.com/). Per-endpoint Instagram credit costs: UNVERIFIED.
- Data365: Basic €300 a month (1 network, 500,000 credits), Standard €850 (3 networks, 1M credits). Generic credit costs: post 1, search 7, profile with info 9. — [Data365 pricing](https://data365.co/pricing). Instagram-specific costs: UNVERIFIED.
- HikerAPI: from $0.0006 per request, prepaid, no subscription; it charges for 200, 403 and 404 responses. — [HikerAPI](https://hikerapi.com/)
- PhantomBuster: $69, $159 or $439 a month (20, 80 or 300 execution hours), from third-party sources only. — [ColdIQ](https://coldiq.com/blog/phantombuster-pricing); [Valley](https://www.joinvalley.co/blog/phantombuster-pricing-2026). UNVERIFIED on PhantomBuster's own page.

### Inferences
Monthly cost estimates. All are ESTIMATES. Assumptions: one lookup = 1 profile + 12 recent Reels (12 is an assumption) = 13 results or about 2 API calls; discovery = 300 queries a month at about 30 results each = 9,000 results.

| Vendor | (a) 2,000 lookups/month | (b) 20,000 lookups/month |
|---|---|---|
| Apify official, Starter rate $2.30/1K | 2,000 x 13 = 26,000 results -> $59.80, + 9,000 discovery -> $20.70; about $81 + plan fee | 260,000 + 9,000 = 269,000 results at the Scale rate $1.90/1K -> about $511 + plan fee |
| Bright Data, PAYG $1.5/1K | 26,000 -> $39 (discovery is a separate hashtag product) | 260,000 -> $390 PAYG, or Scale $499 (384K included) |
| ScrapeCreators | 2 credits x 2,000 + 300 = 4,300 credits; one $47 pack lasts about 5 months | 40,300 credits; Business $497 (500K) lasts about 12 months, about $41/month amortised |
| EnsembleData | (3 + 12) units x 2,000 = 30,000 units/month, about 1,000/day + discovery -> Wood $100 | 300,000 units/month, about 10,000/day -> Silver $400 tight, Gold $800 safer |
| Data365 | 2,000 x 9 + 24,000 + 300 x 7 = 44,100 credits -> Basic €300 | 180,000 + 240,000 + 2,100 = 422,100 credits -> Basic €300 still fits |
| HikerAPI | 4,300 requests x $0.0006 = about $2.58 | 40,300 x $0.0006 = about $24 |

- EnsembleData's limit is daily, so weekly batches must be spread evenly across the week or the daily cap is hit.
- Cheapest with clean wording on collection: ScrapeCreators (but collection method unconfirmed). Clearest on collection: Apify official, at roughly $80 to $510 a month.

### Gaps
- Bright Data's Master Service Agreement terms on redistribution were not read.
- Data365 and Bright Data full customer terms on customer liability were not read.
- RapidAPI listing prices and terms could not be loaded.

## Public reports of Instagram endpoints breaking or being blocked, and Meta lawsuits

### Takeaway
Breakage is ongoing: Apify's own changelog shows partial-profile failures in October 2026 and fields Instagram stopped sending. Meta sued Bright Data and lost on logged-out scraping in January 2024, then dropped the case. I found no Meta suits against these vendors in 2025 or 2026.

### Cited Findings
- Apify changelog: "Since 2026-10-13 many runs returned only the first pages of a profile" (fixed 2026-10-15); `reshareCount` always empty "because Instagram no longer sends this value" (2026-10-01); `isSponsored` deprecated, as Instagram no longer provides it (2025-12-10); profiles whose pagination stopped after one page fixed (2026-09-21). — [Apify changelog](https://apify.com/apify/instagram-scraper/changelog)
- Vendor blogs report more login walls ("require_login": true responses that residential IPs don't fix), Imperva bot scoring, and GraphQL `doc_id` rotating every 2 to 4 weeks. — [Browserless](https://www.browserless.io/blog/scrape-instagram); [Scrapeway](https://scrapeway.com/targets/instagram); [SocialCrawl](https://www.socialcrawl.dev/blog/instagram-scraping-2026.md) (all vendor content)
- Meta v. Bright Data (N.D. Cal., 3:23-cv-00077-EMC): on 2024-01-23 the court found Meta's terms do not prohibit logged-off scraping of public data, and that Bright Data, while logged off, was not bound as a "user". — [Farella Braun + Martel](https://www.fbm.com/technology/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/); [MediaPost](https://www.mediapost.com/publications/article/392920/judge-sides-against-meta-in-battle-over-scraping-p.html). Meta dropped the suit about a month later. — [TechCrunch](https://techcrunch.com/2024/02/26/meta-drops-lawsuit-against-web-scraping-firm-bright-data-that-sold-millions-of-instagram-records)
- Earlier Meta actions: BrandTotal and Unimania agreed to a permanent injunction (2022); Voyager Labs (fake accounts, 2023); Octopus Data (2022). — [Techdirt](https://www.techdirt.com/?p=366235); [giga.law](https://giga.law/daily-news/2022/7/5/meta-files-lawsuits-over-alleged-illegal-scraping-of-facebook-instagram)

### Inferences
- The Bright Data ruling is a district court decision, not appellate precedent, and it is specific to logged-out collection under Meta's terms. Logged-in or fake-account collection (Voyager, Octopus) is where Meta has won or settled.
- Buying from a logged-out vendor moves the collection risk to the vendor, but the terms above put compliance (GDPR, display of personal data) back on SOCIA.

### Gaps
- No search found Meta suits filed in 2025 or 2026 against any vendor named here.
- No independent outage history (status pages, third-party monitoring) was found for EnsembleData, ScrapeCreators, Data365 or HikerAPI.
