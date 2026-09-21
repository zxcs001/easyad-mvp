"use strict";

// Thunder Bay demo data: screens, advertisers, campaigns and the constants the
// booking generator needs.
//
// Every number here is either published, with its source named, or an estimate
// whose arithmetic is written down. docs/DEMO_DATA_RESEARCH.md holds the
// method, the sources and the decisions. Change a figure there first.
//
// Two rules this file keeps:
//   1. The screens sit at real civic and campus places, because the city and
//      the university really do own those buildings.
//   2. Every advertiser is invented. No real business may look like it bought
//      advertising. Names were searched against Thunder Bay directories first.

// --- Trading constants -------------------------------------------------------

const SPOT_SECONDS = 10;            // divides into both a 60s and a 120s loop
const ROADSIDE_LOOP_SECONDS = 60;   // Canadian street-level: 6-8 messages a minute
const INDOOR_LOOP_SECONDS = 90;     // venue networks run 60-120s
const PLATFORM_FEE_RATE = 0.15;     // the out-of-home agency commission; app/utils.ts agrees

// Screen uptime of 99.0-99.5% less 0.3-1.0% failed plays.
const DELIVERY_RATE = { min: 0.96, normal: [0.98, 0.995], alarm: 0.95 };

// The map stores percentages, not coordinates. This transform was recovered
// from the four original records that carry real addresses; it matches three of
// them to within 0.006. y runs downward, so latitude rises as y falls.
function mapPosition(latitude, longitude) {
  return {
    x: Number((0.6281 * longitude + 123.3508).toFixed(3)),
    y: Number((-1.3916 * latitude + 108.2789).toFixed(3)),
  };
}

// Footfall by month, averaging about 1.00 over the year. The campus swings
// 3.75:1 between July and September; the city centre only 1.64:1.
const SEASONALITY = {
  city: [0.78, 0.82, 0.88, 0.95, 1.02, 1.12, 1.25, 1.28, 1.10, 1.00, 0.90, 0.95],
  campus: [1.45, 1.30, 1.40, 1.05, 0.45, 0.40, 0.40, 0.45, 1.50, 1.45, 1.40, 0.90],
};

// Revenue by month against an average of 100. The autumn stacks the tire,
// enrolment and flu seasons; January follows the holiday spend.
const REVENUE_INDEX = [95, 90, 100, 105, 115, 110, 105, 115, 125, 130, 125, 85];

// The city median household income, used as the area income on every screen
// (2021 census, 2020 income).
const AREA_INCOME = 66163;

// --- The twelve screens ------------------------------------------------------
//
// traffic and impressions are annual-average weekday figures, per day, for the
// whole screen. A booking earns its share of the loop, not the whole screen.

const faces = [
  {
    id: "INV-DEMO-GOV-001",
    institutionKey: "government-owner",
    managerKey: "government-operator-primary",
    name: "Thunder Bay City Hall Civic Screen",
    address: "500 Donald Street East, Thunder Bay, ON P7E 5V3",
    latitude: 48.38209,
    longitude: -89.24598,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "public-info",
    price: 14,
    traffic: 2600,
    impressions: 1800,
    audience: "Residents doing municipal business, council visitors and south-core bus riders",
    competitor: "Low",
    occupancy: 62,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "city",
    measurementSource: "ESTIMATE: terminal bus arrivals (GTFS 2026) plus counter visitors",
    tags: ["civic", "indoor", "transit-adjacent", "south-core", "government", "wayfinding"],
  },
  {
    id: "INV-DEMO-GOV-002",
    institutionKey: "government-owner",
    managerKey: "government-operator-primary",
    name: "Waterfront Transit Terminal Screen",
    address: "40 North Water Street, Thunder Bay, ON P7A 4K4",
    latitude: 48.43565,
    longitude: -89.21706,
    format: "transit",
    deliveryMode: "digital",
    productType: "transit-terminal-digital",
    displayTemplate: "transit",
    price: 21,
    traffic: 2250,
    impressions: 1900,
    audience: "Transit riders with a five to fifteen minute wait, north-core workers and waterfront visitors",
    competitor: "Medium",
    occupancy: 71,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "city",
    measurementSource: "ESTIMATE: 635 weekday bus arrivals, the busiest stop in the network (GTFS 2026)",
    tags: ["transit", "terminal", "north-core", "high-dwell", "waterfront", "commuter"],
  },
  {
    id: "INV-DEMO-GOV-003",
    institutionKey: "government-owner",
    managerKey: "government-operator-backup",
    name: "Prince Arthur's Landing Waterfront Screen",
    address: "65 Marina Park Drive, Thunder Bay, ON P7B 0A2",
    latitude: 48.43996,
    longitude: -89.20976,
    format: "digital",
    deliveryMode: "digital",
    productType: "outdoor-digital",
    displayTemplate: "community",
    price: 18,
    traffic: 1890,
    impressions: 1050,
    audience: "Families, festival crowds, cruise passengers and waterfront walkers, June to September",
    competitor: "Low",
    occupancy: 58,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "city",
    measurementSource: "ESTIMATE: 690,000 visits a year; about 4,800 on an August day",
    tags: ["waterfront", "outdoor", "seasonal", "tourism", "events", "family"],
  },
  {
    id: "INV-DEMO-GOV-004",
    institutionKey: "government-owner",
    managerKey: "government-operator-primary",
    name: "Canada Games Complex Entrance Screen",
    address: "420 Winnipeg Avenue, Thunder Bay, ON P7B 2M4",
    latitude: 48.42363,
    longitude: -89.24147,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "fullscreen",
    price: 14,
    traffic: 1233,
    impressions: 1050,
    audience: "Swimmers, fitness members and youth-sport families entering through one controlled door",
    competitor: "Low",
    occupancy: 66,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "city",
    measurementSource: "PUBLISHED: 450,000 visitors a year (Attractions Canada 2024) divided by 365",
    tags: ["recreation", "indoor", "entrance", "fitness", "family", "year-round"],
  },
  {
    id: "INV-DEMO-GOV-005",
    institutionKey: "government-owner",
    managerKey: "government-operator-backup",
    name: "Community Auditorium Lobby Screen",
    address: "1 Paul Shaffer Drive, Thunder Bay, ON P7B 2M4",
    latitude: 48.42246,
    longitude: -89.24158,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "fullscreen",
    price: 12,
    traffic: 411,
    impressions: 390,
    audience: "Ticketed arts, symphony and graduation audiences with a long pre-show lobby dwell",
    competitor: "Low",
    occupancy: 55,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "city",
    measurementSource: "PUBLISHED: 150,000 patrons a year (venue 2024) divided by 365",
    tags: ["arts", "indoor", "high-dwell", "events", "evening", "premium"],
  },
  {
    id: "INV-DEMO-GOV-006",
    institutionKey: "government-owner",
    managerKey: "government-operator-backup",
    name: "Fort William Gardens Concourse Screen",
    address: "901 Miles Street East, Thunder Bay, ON P7C 1J9",
    latitude: 48.38578,
    longitude: -89.25041,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "fullscreen",
    price: 12,
    traffic: 413,
    impressions: 310,
    audience: "University and junior hockey crowds plus minor-hockey families, September through April",
    competitor: "Medium",
    occupancy: 57,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "city",
    measurementSource: "ESTIMATE: 99,000 season visits over a 240-day season",
    tags: ["arena", "indoor", "sports", "seasonal", "south-core", "family"],
  },
  {
    id: "INV-DEMO-GOV-007",
    institutionKey: "government-owner",
    managerKey: "government-operator-primary",
    name: "Waverley Resource Library Entrance Screen",
    address: "285 Red River Road, Thunder Bay, ON P7B 1A9",
    latitude: 48.43617,
    longitude: -89.22364,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "public-info",
    price: 12,
    traffic: 299,
    impressions: 260,
    audience: "Library users, students, newcomers and Red River Road transit riders in the north core",
    competitor: "Low",
    occupancy: 56,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "city",
    measurementSource: "ESTIMATE: 269,000 library visits in 2024, 40% share to this branch",
    tags: ["library", "indoor", "north-core", "civic", "education", "community"],
  },
  {
    id: "INV-DEMO-GOV-008",
    institutionKey: "government-owner",
    managerKey: "government-operator-primary",
    name: "Memorial Avenue at Harbour Expressway Digital",
    address: "Memorial Avenue at Harbour Expressway, Thunder Bay, ON P7B 3Y6",
    latitude: 48.40780,
    longitude: -89.24530,
    format: "digital",
    deliveryMode: "digital",
    productType: "roadside-digital",
    displayTemplate: "fullscreen",
    price: 90,
    traffic: 26000,
    impressions: 10000,
    audience: "Intercity retail shoppers and cross-town commuters at the city's busiest signalised junction",
    competitor: "High",
    occupancy: 74,
    loopSeconds: ROADSIDE_LOOP_SECONDS,
    season: "city",
    measurementSource: "ESTIMATE anchored on MTO 2019 AADT 24,400 for Highway 61, scaled 1.07",
    tags: ["roadside", "digital", "retail", "high-traffic", "intercity", "commuter"],
  },
  {
    id: "INV-DEMO-STATIC-001",
    institutionKey: "government-owner",
    managerKey: "government-operator-primary",
    name: "Memorial Avenue Bulletin Face",
    address: "Memorial Avenue at Central Avenue, Thunder Bay, ON P7B 3Y6",
    latitude: 48.40190,
    longitude: -89.24480,
    format: "static",
    deliveryMode: "static",
    productType: "bulletin-face",
    displayTemplate: "fullscreen",
    price: 50,
    traffic: 22000,
    impressions: 8470,
    audience: "Drivers, retail visitors and commuters on the Intercity approach",
    competitor: "High",
    occupancy: 68,
    loopSeconds: 0,
    season: "city",
    productionLeadDays: 8,
    installationLeadDays: 4,
    measurementSource: "ESTIMATE: 22,000 AADT x 0.50 x 1.4 x 0.55 visibility",
    tags: ["roadside", "physical", "static", "retail", "high-traffic", "illuminated"],
  },
  {
    id: "INV-DEMO-INST-001",
    institutionKey: "institution-owner",
    managerKey: "institution-operator",
    name: "Lakehead University Agora Screen",
    address: "Agora, Lakehead University, 955 Oliver Road, Thunder Bay, ON P7B 5E1",
    latitude: 48.42158,
    longitude: -89.26244,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "weather",
    price: 24,
    traffic: 4920,
    impressions: 3300,
    audience: "Undergraduates, graduate students and faculty crossing the campus's central indoor crossroads",
    competitor: "Low",
    occupancy: 72,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "campus",
    measurementSource: "ESTIMATE: 8,200 campus population x 0.60 weekday attendance",
    tags: ["campus", "indoor", "students", "high-dwell", "hub", "in-term"],
  },
  {
    id: "INV-DEMO-INST-002",
    institutionKey: "institution-owner",
    managerKey: "institution-operator",
    name: "Lakehead Athletics Centre Entrance Screen",
    address: "Lakehead Athletics Centre, 955 Sanders Drive, Thunder Bay, ON P7B 5E1",
    latitude: 48.42043,
    longitude: -89.26851,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "fullscreen",
    price: 14,
    traffic: 1148,
    impressions: 980,
    audience: "Varsity athletes, recreation members and community users at a single controlled door",
    competitor: "Low",
    occupancy: 64,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "campus",
    measurementSource: "ESTIMATE: 14% of the 8,200 campus population on a weekday",
    tags: ["campus", "athletics", "indoor", "entrance", "students", "fitness"],
  },
  {
    id: "INV-DEMO-INST-003",
    institutionKey: "institution-owner",
    managerKey: "institution-operator",
    name: "Bora Laskin Faculty of Law Screen",
    address: "Bora Laskin Faculty of Law, 401 Red River Road, Thunder Bay, ON P7B 1A5",
    latitude: 48.43788,
    longitude: -89.22791,
    format: "digital",
    deliveryMode: "digital",
    productType: "indoor-digital",
    displayTemplate: "public-info",
    price: 12,
    traffic: 760,
    impressions: 620,
    audience: "Law students, faculty, legal-clinic clients and north-core visitors to a heritage public building",
    competitor: "Low",
    occupancy: 59,
    loopSeconds: INDOOR_LOOP_SECONDS,
    season: "campus",
    measurementSource: "ESTIMATE: law faculty of about 250 plus other building users",
    tags: ["campus", "north-core", "indoor", "heritage", "professional", "in-term"],
  },
  {
    id: "INV-DEMO-INST-004",
    institutionKey: "institution-owner",
    managerKey: "institution-operator",
    name: "Lakehead University Transit Shelter Screen",
    address: "Oliver Road at Lakehead University main entrance, Thunder Bay, ON P7B 5E1",
    latitude: 48.42144,
    longitude: -89.26211,
    format: "transit",
    deliveryMode: "digital",
    productType: "transit-shelter-digital",
    displayTemplate: "transit",
    price: 21,
    traffic: 16300,
    impressions: 4100,
    audience: "UPass students waiting for a bus, plus Oliver Road drivers heading to the hospital and the west side",
    competitor: "Medium",
    occupancy: 69,
    loopSeconds: ROADSIDE_LOOP_SECONDS,
    season: "campus",
    measurementSource: "ESTIMATE: 2,300 waiting riders plus 14,000 AADT passing vehicles",
    tags: ["transit", "shelter", "campus", "roadside", "students", "high-dwell"],
  },
];

// --- From a face rate to a slot rate -----------------------------------------
//
// The price above is the researched rate for the WHOLE face: one day of the
// complete loop, or of the poster. The application bills price x days x slots
// (estimateSpend in app/utils.ts), so the price a screen carries must be the
// rate for ONE spot. Dividing keeps the two ends honest: a buyer who takes the
// whole loop pays the face rate, and a buyer who takes one spot of nine pays a
// ninth and earns a ninth of the audience. Leaving the face rate in place made
// the demo report a $66 CPM against a researched band near $15.
//
// The floor is $3 a day. An operator does not sell a spot below the cost of
// handling it, which is why small indoor faces sell packages, not single spots.

const SLOT_PRICE_FLOOR = 3;

function slotsInLoop(face) {
  if (face.deliveryMode === "static" || !face.loopSeconds) return 1;
  return Math.max(1, Math.round(face.loopSeconds / SPOT_SECONDS));
}

const screens = faces.map((face) => ({
  ...face,
  facePrice: face.price,
  slotsInLoop: slotsInLoop(face),
  price: Math.max(SLOT_PRICE_FLOOR, Math.round(face.price / slotsInLoop(face))),
}));

// --- The advertisers, all invented ------------------------------------------
//
// tier drives how often an advertiser books and how much it spends.
// account says which demo sign-in creates the booking: the agency books for
// most of the roster, and the two direct accounts book under their own names.

const advertisers = [
  { name: "Slate River Auto Group", category: "Auto dealer", tier: "flagship", account: "advertiser-agency", months: [4, 5, 7, 8, 9, 10, 12] },
  { name: "Neebing Fresh Market", category: "Grocery", tier: "flagship", account: "advertiser-retail", months: [5, 6, 7, 8, 9, 10, 12] },
  { name: "Kam Bay Chicken Co.", category: "Quick service restaurant", tier: "large", account: "advertiser-retail", months: [1, 2, 5, 6, 7, 8, 11, 12] },
  { name: "Wolf River Tire & Auto", category: "Tire and auto service", tier: "large", account: "advertiser-agency", months: [4, 5, 10, 11] },
  { name: "Stonegate Credit Union", category: "Credit union", tier: "large", account: "advertiser-agency", months: [1, 2, 4, 5, 6, 9, 10] },
  { name: "Northline Fitness Marketing", category: "Gym", tier: "medium", account: "advertiser-local", months: [1, 2, 4, 5, 9, 12] },
  { name: "Atlas Grocery Campaign Team", category: "Grocery", tier: "large", account: "advertiser-retail", months: [5, 6, 7, 8, 9, 10, 11, 12] },
  { name: "Rasmussen & Doucette Injury Law", category: "Legal", tier: "medium", account: "advertiser-agency", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { name: "Trowbridge Family Dental", category: "Dental", tier: "small", account: "advertiser-local", months: [1, 9, 11, 12] },
  { name: "Bare Point Physiotherapy", category: "Health services", tier: "small", account: "advertiser-local", months: [1, 3, 9, 10] },
  { name: "Current River Hearing Centre", category: "Hearing and health retail", tier: "small", account: "advertiser-local", months: [2, 5, 9, 11] },
  { name: "Vandermeer Roofing & Exteriors", category: "Roofing", tier: "medium", account: "advertiser-agency", months: [2, 3, 5, 6, 7, 8, 9] },
  { name: "Hazelwood Windows & Doors", category: "Windows", tier: "medium", account: "advertiser-agency", months: [2, 3, 4, 5, 9, 10] },
  { name: "Tervo Heating & Cooling", category: "HVAC", tier: "medium", account: "advertiser-agency", months: [1, 5, 6, 8, 9, 10] },
  { name: "Sibley Strength & Conditioning", category: "Gym", tier: "small", account: "advertiser-local", months: [1, 2, 4, 9] },
  { name: "Portage Bay Career College", category: "Career college", tier: "large", account: "advertiser-agency", months: [1, 3, 4, 8, 9, 10, 11] },
  { name: "Whitefish Valley Gaming Centre", category: "Charitable gaming", tier: "medium", account: "advertiser-local", months: [3, 6, 9, 11, 12] },
  { name: "Amethyst Bluff Lodge", category: "Tourism and lodging", tier: "medium", account: "advertiser-retail", months: [1, 2, 5, 6, 7, 8] },
  { name: "Northlight Energy Co-operative", category: "Utility and energy", tier: "medium", account: "advertiser-agency", months: [1, 2, 4, 5, 6, 7] },
  { name: "Halvorsen & Sons Flooring", category: "Home improvement retail", tier: "small", account: "advertiser-retail", months: [2, 3, 5, 9, 11] },
  { name: "Kolstad Home Furnishings", category: "Furniture retail", tier: "medium", account: "advertiser-retail", months: [2, 5, 9, 11, 12] },
  { name: "Bergstrom Financial Group", category: "Insurance and financial", tier: "small", account: "advertiser-local", months: [1, 2, 9, 10] },
];

// Spend bands by tier, in dollars, before the monthly index is applied.
// loop is the share of a screen's loop the advertiser buys. A flagship takes
// close to half of a small indoor loop; a corner shop takes one spot. Spend is
// the result of loop share x days x rate, not a figure set here.
const TIERS = {
  small: { loop: 0.12, screens: [1, 1], weeks: [1, 2, 4], share: 0.40 },
  medium: { loop: 0.20, screens: [2, 4], weeks: [2, 4, 6], share: 0.35 },
  large: { loop: 0.30, screens: [4, 7], weeks: [4, 6, 8], share: 0.18 },
  flagship: { loop: 0.45, screens: [7, 12], weeks: [8, 13], share: 0.07 },
};

// Campaign names read like a media plan: who, what offer, and when. An offer
// with months only appears in those months, so a name never contradicts its
// flight ("September Restart" must not run in December.)
const CAMPAIGN_OFFERS = {
  "Auto dealer": [
    { text: "Winter Tire Changeover Event", months: [9, 10, 11] },
    { text: "Model-Year Clearance", months: [8, 9, 10] },
    { text: "Spring Service Event", months: [4, 5] },
    { text: "Year-End Sales Event", months: [11, 12] },
    { text: "0% Financing" },
  ],
  "Grocery": [
    { text: "Barbecue Season Prices", months: [5, 6, 7, 8] },
    { text: "Back to School Basics", months: [8, 9] },
    { text: "Thanksgiving Table", months: [9, 10] },
    { text: "Holiday Feast Prices", months: [11, 12] },
    { text: "Weekly Price Drop" },
  ],
  "Quick service restaurant": [
    { text: "Patio Season", months: [5, 6, 7, 8] },
    { text: "Value Menu Launch", months: [1, 2] },
    { text: "Limited-Time Offer" },
    { text: "Late Night Hours" },
  ],
  "Tire and auto service": [
    { text: "Tire Changeover Booking", months: [4, 5, 10, 11] },
    { text: "Seasonal Storage Offer", months: [4, 5, 10, 11] },
    { text: "Brake Safety Check" },
  ],
  "Credit union": [
    { text: "RRSP Deadline Countdown", months: [1, 2] },
    { text: "Mortgage Renewal Offer", months: [4, 5, 6] },
    { text: "Member and Community", months: [9, 10] },
    { text: "Everyday Banking" },
  ],
  "Gym": [
    { text: "New Year Membership Drive", months: [12, 1, 2] },
    { text: "Spring Challenge", months: [4, 5] },
    { text: "September Restart", months: [9] },
    { text: "Member Open House" },
  ],
  "Legal": [
    { text: "Winter Collision Awareness", months: [11, 12, 1, 2] },
    { text: "Always-On Awareness" },
    { text: "Know Your Rights" },
  ],
  "Dental": [
    { text: "Use Your Benefits Before They Expire", months: [11, 12] },
    { text: "Benefit Year Reset", months: [1] },
    { text: "New Patient Openings" },
  ],
  "Health services": [
    { text: "Sports Injury Clinic", months: [9, 10] },
    { text: "Post-Surgery Recovery Programme" },
    { text: "Book an Assessment" },
  ],
  "Hearing and health retail": [
    { text: "Free Hearing Test Week" },
    { text: "Hearing Aid Trial" },
  ],
  "Roofing": [
    { text: "Home Show Presence", months: [2, 3] },
    { text: "Book the Work Season", months: [5, 6, 7, 8, 9] },
    { text: "Storm Damage Inspection" },
  ],
  "Windows": [
    { text: "Home Show Presence", months: [2, 3] },
    { text: "Winter Draught Check", months: [9, 10] },
    { text: "Window Replacement Rebate" },
  ],
  "HVAC": [
    { text: "Furnace Season Tune-Up", months: [8, 9, 10] },
    { text: "Air Conditioning Ready", months: [5, 6] },
    { text: "Emergency Service Line", months: [1, 2] },
    { text: "Annual Service Plan" },
  ],
  "Career college": [
    { text: "Application Deadline Countdown", months: [1] },
    { text: "Open House", months: [9, 10, 11] },
    { text: "Offer and Confirm", months: [3, 4] },
    { text: "Trades Intake", months: [8] },
    { text: "Programme Information" },
  ],
  "Charitable gaming": [
    { text: "Holiday Gift Lottery", months: [11, 12] },
    { text: "Jackpot Burst" },
    { text: "Weekend Draw" },
  ],
  "Tourism and lodging": [
    { text: "Summer Stay Offer", months: [5, 6, 7, 8] },
    { text: "Winter Escape", months: [1, 2] },
    { text: "Long Weekend Getaway" },
  ],
  "Utility and energy": [
    { text: "Heating Conservation", months: [1, 2] },
    { text: "Cooling Season Tips", months: [6, 7] },
    { text: "Dig Safe Reminder", months: [4, 5] },
    { text: "Save Energy at Home" },
  ],
  "Home improvement retail": [
    { text: "Spring Refresh", months: [3, 4, 5] },
    { text: "Black Friday Retail", months: [11] },
    { text: "Flooring Sale" },
  ],
  "Furniture retail": [
    { text: "Boxing Week Retail", months: [12] },
    { text: "Spring Refresh", months: [3, 4, 5] },
    { text: "Mattress Event" },
  ],
  "Insurance and financial": [
    { text: "Retirement Review", months: [1, 2] },
    { text: "Life Cover Check" },
    { text: "Small Business Cover" },
  ],
};

const SEASON_WORDS = ["Winter", "Spring", "Summer", "Autumn"];

// City notices run on the city's own screens at no cost. They still take
// inventory, which is what separates an owned network from a marketplace.
const cityNotices = [
  { title: "Calendar Parking: Effective 26 November", months: [11], weeks: 2 },
  { title: "Winter Priority Routes — Clear By 2 a.m.", months: [11, 12, 1, 2, 3], weeks: 1 },
  { title: "Snow Clearing Update — Your Street", months: [12, 1, 2, 3], weeks: 1 },
  { title: "Extreme Cold Warning — Warming Centres Open", months: [1, 2], weeks: 1 },
  { title: "Budget Open House — Have Your Say", months: [12, 1], weeks: 2 },
  { title: "Summer Camp Registration Opens", months: [3], weeks: 3 },
  { title: "Spring Yard Waste Collection Begins", months: [4, 5], weeks: 2 },
  { title: "Hydrant Flushing in Your Neighbourhood", months: [5, 6], weeks: 2 },
  { title: "Water Main Work — Expect Delays", months: [5, 6, 7, 8, 9], weeks: 2 },
  { title: "Road Construction Season — Plan Your Route", months: [5, 6, 7, 8, 9], weeks: 6 },
  { title: "Splash Pads and Beaches Are Open", months: [6, 7, 8], weeks: 8 },
  { title: "Air Quality Advisory — Wildfire Smoke", months: [6, 7, 8], weeks: 1 },
  { title: "Fall Recreation Registration", months: [8], weeks: 3 },
  { title: "Transit Service Change: New Schedules", months: [1, 9], weeks: 2 },
  { title: "Flu Shots Are Free — Book Now", months: [10, 11, 12], weeks: 6 },
  { title: "Municipal Election: Advance Voting Opens", months: [9, 10], weeks: 4 },
  { title: "Learn to Skate — Winter Session", months: [11, 12], weeks: 3 },
  { title: "Plan a Safe Ride Home", months: [12], weeks: 4 },
  { title: "Report a Pothole — Use the City App", months: [4, 5], weeks: 2 },
  { title: "Household Hazardous Waste Day", months: [5, 9], weeks: 1 },
];

// A rejection needs a reason a person would recognise.
const rejectionReasons = [
  "Creative resolution is below the screen specification",
  "Text is too small for the viewing distance",
  "Content category is not allowed on municipal screens",
  "No French version for a screen set to French",
  "The offer expiry date has already passed",
  "Venue exclusivity is held by another advertiser",
  "File format is not supported by this player",
];

module.exports = {
  AREA_INCOME,
  CAMPAIGN_OFFERS,
  DELIVERY_RATE,
  INDOOR_LOOP_SECONDS,
  PLATFORM_FEE_RATE,
  REVENUE_INDEX,
  ROADSIDE_LOOP_SECONDS,
  SEASONALITY,
  SEASON_WORDS,
  SPOT_SECONDS,
  TIERS,
  advertisers,
  cityNotices,
  mapPosition,
  rejectionReasons,
  screens,
};
