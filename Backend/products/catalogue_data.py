"""Realistic catalogue content for `seed_demo`.

Kept in its own module because the seed command should read as *logic*, not as a
wall of product copy. Names are generic ("Aurora", "Vertex") rather than real
brands — a portfolio project shouldn't imply a commercial relationship, and
invented brands make it obvious the data is demo data.

Each entry carries enough detail that the catalogue exercises real features:
variants drive the option picker, `specs` produce a genuine description, and the
price spread means filters and sorting have something to bite on.
"""

# Shops, each with a personality so the multi-vendor angle is visible.
SHOPS = [
    {
        "slug": "voltedge",
        "name": "VoltEdge Electronics",
        "tagline": "Computing and audio, tested before it ships",
        "description": (
            "We stock computing and audio gear we'd use ourselves. Every unit is "
            "bench-tested before dispatch, and we publish the actual measured "
            "specs rather than the marketing ones."
        ),
        "commission": "8.50",
    },
    {
        "slug": "northloom",
        "name": "North Loom",
        "tagline": "Everyday clothing built to outlast the season",
        "description": (
            "Small-batch apparel in natural fibres. We list the fabric weight "
            "and origin for everything, and we don't run fake sales."
        ),
        "commission": "12.00",
    },
    {
        "slug": "hearthandpine",
        "name": "Hearth & Pine",
        "tagline": "Kitchen and home, chosen for how it wears",
        "description": (
            "Cookware and homeware picked for durability over novelty. If it "
            "won't survive a decade of real use, we don't carry it."
        ),
        "commission": "11.00",
    },
    {
        "slug": "marginalia",
        "name": "Marginalia Books",
        "tagline": "Technology, business and fiction worth the shelf space",
        "description": (
            "An independent bookshop. Staff notes on most titles, and we'll tell "
            "you honestly when a book hasn't aged well."
        ),
        "commission": "15.00",
    },
    {
        "slug": "kitframe",
        "name": "KitFrame Studio",
        "tagline": "Cameras, lenses and the bits that hold them up",
        "description": (
            "Photography equipment for people who shoot regularly. Used stock is "
            "graded honestly and comes with sample frames."
        ),
        "commission": "9.00",
    },
    {
        "slug": "rundeck",
        "name": "Rundeck Athletic",
        "tagline": "Footwear and kit for running that actually happens",
        "description": (
            "Running and training gear. We list stack height, drop and weight, "
            "because those are the numbers that decide whether a shoe suits you."
        ),
        "commission": "10.00",
    },
]


# (category slug, shop slug, name, price, compare_at or None, stock,
#  short_description, specs list, variants list, featured)
#
# Variants are (group, value, price delta, stock).
PRODUCTS = [
    # ---------------------------------------------------------- laptops ----
    (
        "electronics-laptops", "voltedge",
        "Aurora 14 Ultrabook", "1249.00", "1449.00", 12,
        "A 1.2 kg aluminium ultrabook with a 14-inch 2.8K display and 18-hour battery.",
        ["14-inch 2880×1800 OLED, 120 Hz", "16 GB LPDDR5 memory", "512 GB NVMe SSD",
         "1.24 kg, 15.9 mm thick", "Measured 17h 40m video playback",
         "2× Thunderbolt 4, 1× USB-A, HDMI 2.1"],
        [("Memory", "16 GB", "0.00", 12), ("Memory", "32 GB", "260.00", 5)],
        True,
    ),
    (
        "electronics-laptops", "voltedge",
        "Vertex 16 Creator Laptop", "2189.00", None, 4,
        "Sixteen-inch workstation with a colour-calibrated panel and discrete GPU.",
        ["16-inch 3200×2000 mini-LED, 165 Hz", "32 GB DDR5", "1 TB NVMe SSD",
         "Discrete 12 GB GPU", "Factory-calibrated, ΔE < 2", "2.1 kg"],
        [("Storage", "1 TB", "0.00", 4), ("Storage", "2 TB", "310.00", 2)],
        True,
    ),
    (
        "electronics-laptops", "voltedge",
        "Nimbus 13 Everyday Notebook", "679.00", "779.00", 26,
        "A dependable 13-inch machine for browsing, documents and study.",
        ["13.3-inch 1920×1200 IPS", "8 GB LPDDR5", "256 GB SSD",
         "1.1 kg", "Fanless — completely silent", "Backlit keyboard"],
        [], False,
    ),
    (
        "electronics-laptops", "voltedge",
        "Aurora 15 Gaming Rig", "1699.00", None, 0,
        "High-refresh gaming laptop with a vapour-chamber cooling stack.",
        ["15.6-inch 2560×1440, 240 Hz", "16 GB DDR5", "1 TB NVMe SSD",
         "Vapour chamber cooling", "Per-key RGB", "2.4 kg"],
        [], False,
    ),

    # ------------------------------------------------------ smartphones ----
    (
        "electronics-smartphones", "voltedge",
        "Lumen 7 Pro Smartphone", "899.00", "999.00", 18,
        "Six-point-seven-inch flagship with a 50 MP main sensor and 5-year updates.",
        ["6.7-inch 1440×3120 LTPO, 1–120 Hz", "50 MP f/1.7 main, 48 MP ultrawide",
         "5× optical telephoto", "5000 mAh, 80 W wired", "IP68",
         "5 years of OS updates"],
        [("Storage", "256 GB", "0.00", 18), ("Storage", "512 GB", "120.00", 7),
         ("Colour", "Graphite", "0.00", 10), ("Colour", "Sage", "0.00", 8)],
        True,
    ),
    (
        "electronics-smartphones", "voltedge",
        "Lumen 7 Compact", "649.00", None, 22,
        "The same camera stack in a phone you can use one-handed.",
        ["6.1-inch 1080×2340 OLED, 120 Hz", "50 MP f/1.7 main",
         "4200 mAh, 65 W wired", "IP68", "168 g"],
        [("Storage", "128 GB", "0.00", 22), ("Storage", "256 GB", "80.00", 9)],
        False,
    ),
    (
        "electronics-smartphones", "voltedge",
        "Beacon A3 Budget Phone", "219.00", "259.00", 40,
        "Two-day battery and a headphone jack, for under three hundred.",
        ["6.5-inch 1080×2400 LCD, 90 Hz", "5000 mAh", "3.5 mm headphone jack",
         "Dual SIM + microSD", "2 years of security patches"],
        [], False,
    ),

    # ------------------------------------------------------------ audio ----
    (
        "electronics-audio", "voltedge",
        "Cavern ANC Headphones", "279.00", "329.00", 15,
        "Over-ear active noise cancelling with 38 hours between charges.",
        ["40 mm dynamic drivers", "Hybrid ANC, −32 dB measured",
         "38 h ANC on / 55 h off", "Bluetooth 5.4, LDAC + aptX Lossless",
         "Multipoint to two devices", "254 g"],
        [("Colour", "Midnight", "0.00", 8), ("Colour", "Sand", "0.00", 7)],
        True,
    ),
    (
        "electronics-audio", "voltedge",
        "Cavern Buds Pro", "149.00", "179.00", 34,
        "In-ear ANC buds with wireless charging and a proper fit kit.",
        ["11 mm drivers", "ANC with transparency mode",
         "8 h + 24 h in case", "IPX5", "Four ear-tip sizes included"],
        [], False,
    ),
    (
        "electronics-audio", "hearthandpine",
        "Tabletop Valve Amplifier", "459.00", None, 3,
        "Class-A valve amp for bookshelf speakers, hand-wired in small batches.",
        ["2× 25 W into 8 Ω", "EL84 output valves",
         "RCA and 3.5 mm inputs", "Solid walnut enclosure", "4.8 kg"],
        [], False,
    ),
    (
        "electronics-audio", "voltedge",
        "Studio Monitor Pair — 5 inch", "389.00", "429.00", 6,
        "Near-field monitors flat to ±2 dB, sold as a matched pair.",
        ["5-inch woven cone woofer", "±2 dB, 54 Hz – 22 kHz",
         "XLR and TRS inputs", "Matched pair, serial-adjacent", "6.1 kg each"],
        [], False,
    ),

    # ---------------------------------------------------------- cameras ----
    (
        "electronics-cameras", "kitframe",
        "Meridian M2 Mirrorless Body", "1549.00", None, 7,
        "Full-frame 33 MP body with in-body stabilisation and 8-stop shutter.",
        ["33 MP full-frame BSI sensor", "8-stop in-body stabilisation",
         "Up to 30 fps electronic shutter", "4K 60p 10-bit internal",
         "Dual UHS-II card slots", "Weather-sealed, 658 g"],
        [], True,
    ),
    (
        "electronics-cameras", "kitframe",
        "Meridian 35 mm f/1.8 Prime", "479.00", "529.00", 11,
        "A fast, light 35 mm prime — the lens most people leave on the body.",
        ["35 mm, f/1.8 – f/16", "9-blade rounded aperture",
         "0.24 m minimum focus", "Weather-sealed mount", "285 g"],
        [], False,
    ),
    (
        "electronics-cameras", "kitframe",
        "Carbon Travel Tripod", "229.00", None, 14,
        "Eight-layer carbon legs that fold to 38 cm and hold 12 kg.",
        ["Carbon fibre, 8 layers", "38 cm folded, 158 cm extended",
         "12 kg load rating", "Arca-compatible ball head", "1.28 kg with head"],
        [], False,
    ),

    # ----------------------------------------------------------- gaming ----
    (
        "electronics-audio", "voltedge",
        "Pulse Wireless Gaming Mouse", "89.00", "109.00", 28,
        "Sixty-three grams, 26 000 DPI and a 70-hour battery.",
        ["26 000 DPI optical sensor", "63 g", "70 h battery",
         "1000 Hz polling", "Optical switches, 100 M clicks", "USB-C charging"],
        [("Colour", "Black", "0.00", 16), ("Colour", "White", "0.00", 12)],
        True,
    ),
    (
        "electronics-audio", "voltedge",
        "Pulse 75% Mechanical Keyboard", "139.00", None, 19,
        "Hot-swappable 75% board with gasket mounting and per-key RGB.",
        ["75% layout, 82 keys", "Hot-swappable 3- and 5-pin",
         "Gasket-mounted, five foam layers", "Tri-mode: USB-C, 2.4 GHz, Bluetooth",
         "PBT double-shot keycaps"],
        [("Switch", "Tactile brown", "0.00", 8),
         ("Switch", "Linear red", "0.00", 7),
         ("Switch", "Clicky blue", "0.00", 4)],
        False,
    ),

    # ---------------------------------------------------------- fashion ----
    (
        "fashion-men", "northloom",
        "Heavyweight Cotton Overshirt", "128.00", "158.00", 21,
        "A 340 gsm brushed cotton overshirt that works as a light jacket.",
        ["340 gsm brushed cotton", "Portuguese-milled fabric",
         "Corozo buttons", "Double-stitched seams", "Machine washable at 30°"],
        [("Size", "S", "0.00", 4), ("Size", "M", "0.00", 8),
         ("Size", "L", "0.00", 6), ("Size", "XL", "0.00", 3)],
        False,
    ),
    (
        "fashion-men", "northloom",
        "Merino Crew Knit", "96.00", None, 30,
        "Fine-gauge 100% merino that regulates temperature and resists odour.",
        ["100% extra-fine merino, 19.5 micron", "Fully fashioned shoulders",
         "Machine washable, wool cycle", "Mulesing-free certified"],
        [("Size", "S", "0.00", 7), ("Size", "M", "0.00", 11),
         ("Size", "L", "0.00", 9), ("Size", "XL", "0.00", 3)],
        False,
    ),
    (
        "fashion-women", "northloom",
        "Linen Wrap Dress", "142.00", "172.00", 16,
        "Mid-weight washed European linen with a genuine wrap closure.",
        ["100% washed European linen, 190 gsm", "Self-tie wrap, no hidden zip",
         "Side pockets", "Pre-shrunk", "Machine washable at 30°"],
        [("Size", "XS", "0.00", 3), ("Size", "S", "0.00", 5),
         ("Size", "M", "0.00", 5), ("Size", "L", "0.00", 3)],
        True,
    ),
    (
        "fashion-women", "northloom",
        "Cropped Corduroy Jacket", "168.00", None, 9,
        "Eight-wale organic cotton corduroy with a quilted lining.",
        ["8-wale organic cotton corduroy", "Recycled quilted lining",
         "Four pockets", "Antique brass hardware"],
        [("Size", "S", "0.00", 3), ("Size", "M", "0.00", 4), ("Size", "L", "0.00", 2)],
        False,
    ),
    (
        "fashion-footwear", "rundeck",
        "Trail Runner GTX", "164.00", "189.00", 24,
        "Waterproof trail shoe with a 4 mm lug outsole and rock plate.",
        ["Gore-Tex Invisible Fit upper", "4 mm multi-directional lugs",
         "Full-length rock plate", "8 mm drop, 32 mm stack", "298 g (UK 8)"],
        [("Size", "UK 7", "0.00", 4), ("Size", "UK 8", "0.00", 8),
         ("Size", "UK 9", "0.00", 7), ("Size", "UK 10", "0.00", 5)],
        True,
    ),
    (
        "fashion-footwear", "rundeck",
        "Everyday Road Trainer", "132.00", None, 31,
        "Neutral daily trainer with a supercritical foam midsole.",
        ["Supercritical EVA midsole", "10 mm drop, 36 mm stack",
         "Engineered mesh upper", "252 g (UK 8)", "Rated to ~800 km"],
        [("Size", "UK 7", "0.00", 6), ("Size", "UK 8", "0.00", 11),
         ("Size", "UK 9", "0.00", 9), ("Size", "UK 10", "0.00", 5)],
        False,
    ),
    (
        "fashion-footwear", "rundeck",
        "Canvas Court Sneaker", "78.00", "94.00", 0,
        "A plain low-top in 12 oz canvas with a vulcanised rubber sole.",
        ["12 oz cotton canvas", "Vulcanised rubber sole",
         "Removable cushioned insole", "Unisex sizing"],
        [], False,
    ),

    # ------------------------------------------------------------- home ----
    (
        "home-living-kitchen", "hearthandpine",
        "Carbon Steel Frying Pan — 26 cm", "68.00", None, 27,
        "A 2.5 mm carbon steel pan that seasons to a natural non-stick finish.",
        ["2.5 mm carbon steel", "26 cm cooking surface",
         "Oven safe to 260°C", "Induction compatible", "Riveted steel handle",
         "1.42 kg"],
        [("Size", "24 cm", "-8.00", 9), ("Size", "26 cm", "0.00", 27),
         ("Size", "28 cm", "12.00", 11)],
        True,
    ),
    (
        "home-living-kitchen", "hearthandpine",
        "Pour-Over Coffee Set", "84.00", "99.00", 18,
        "Borosilicate dripper, server and scale for repeatable filter coffee.",
        ["Borosilicate glass dripper and server",
         "0.1 g scale with built-in timer", "600 ml capacity",
         "Includes 40 paper filters", "Dishwasher safe (not the scale)"],
        [], False,
    ),
    (
        "home-living-kitchen", "hearthandpine",
        "Damascus Chef's Knife — 20 cm", "189.00", "229.00", 8,
        "Sixty-seven-layer Damascus over a VG-10 core, at 61 HRC.",
        ["67-layer Damascus, VG-10 core", "61 HRC", "20 cm blade",
         "Stabilised walnut handle", "15° per side edge"],
        [], False,
    ),
    (
        "home-living-furniture", "hearthandpine",
        "Solid Oak Writing Desk", "620.00", None, 4,
        "Kiln-dried European oak on a powder-coated steel frame.",
        ["Kiln-dried European oak, 25 mm", "Powder-coated steel frame",
         "120 × 60 × 74 cm", "Cable channel along the rear",
         "Hard-wax oil finish", "28 kg"],
        [], False,
    ),
    (
        "home-living-furniture", "hearthandpine",
        "Reading Chair with Ottoman", "845.00", "999.00", 2,
        "High-back lounge chair in wool bouclé with a matching ottoman.",
        ["Wool bouclé, 42 000 Martindale", "FSC beech frame",
         "High-resilience foam with feather topper",
         "Ottoman included", "8-year frame warranty"],
        [], True,
    ),
    (
        "home-living-decor", "hearthandpine",
        "Linen Table Lamp", "148.00", None, 13,
        "Turned ash base with a hand-sewn linen shade and dimmable driver.",
        ["Turned solid ash base", "Hand-sewn linen shade",
         "Dimmable LED driver included", "2700 K, 806 lm", "48 cm tall"],
        [], False,
    ),
    (
        "home-living-decor", "northloom",
        "Wool Throw Blanket", "112.00", "134.00", 20,
        "Lambswool throw woven on a traditional Welsh loom.",
        ["100% lambswool", "Woven in Wales",
         "130 × 190 cm", "Hand-finished fringe", "Dry clean only"],
        [], False,
    ),

    # ------------------------------------------------------------ books ----
    (
        "books-technology", "marginalia",
        "Designing Data-Intensive Systems", "52.00", None, 35,
        "The reference on storage, replication and distributed consistency.",
        ["Paperback, 616 pages", "Second edition, 2024",
         "Extensive references per chapter", "Diagrams throughout"],
        [("Format", "Paperback", "0.00", 35), ("Format", "Hardcover", "18.00", 8)],
        True,
    ),
    (
        "books-technology", "marginalia",
        "The Pragmatic Craftsman", "41.00", "49.00", 28,
        "On the habits that separate working software from finished software.",
        ["Paperback, 352 pages", "Anniversary edition",
         "Exercises with worked answers"],
        [], False,
    ),
    (
        "books-business", "marginalia",
        "Small Margins, Long Games", "38.00", None, 22,
        "Case studies in businesses that compounded slowly and survived.",
        ["Hardcover, 288 pages", "14 company case studies",
         "Financial appendix"],
        [], False,
    ),
    (
        "books-fiction", "marginalia",
        "The Cartographer's Apprentice", "24.00", "29.00", 44,
        "A mapmaker's daughter inherits a chart of a coastline that isn't there.",
        ["Paperback, 424 pages", "Debut novel",
         "Includes two fold-out maps"],
        [], False,
    ),
    (
        "books-fiction", "marginalia",
        "Quiet Harbour", "22.00", None, 0,
        "Three generations of a fishing family, told backwards.",
        ["Paperback, 368 pages", "Translated from the Norwegian",
         "Reading-group notes included"],
        [], False,
    ),
]


# Review bodies keyed by rating, so a 5-star review doesn't read like a 2-star one.
REVIEW_TEMPLATES = {
    5: [
        ("Exactly as described", "Third one I've bought. Specs on the listing match what I measured, which is rarer than it should be."),
        ("Worth the money", "Used it daily for two months. No complaints at all — it does the thing it says it does."),
        ("Better than the spec sheet suggests", "I expected a compromise somewhere and haven't found one yet. Packaging was minimal, which I appreciate."),
        ("Would buy again", "Arrived two days early. Build quality is well above what I expected at this price."),
    ],
    4: [
        ("Very good, one small niggle", "Does everything well. The only thing I'd change is the carry case — it's a bit flimsy compared to the product itself."),
        ("Happy with it", "Solid purchase. Took a week to get used to, and now I wouldn't switch back."),
        ("Good value", "Not perfect but nothing at this price is. The important parts are all done properly."),
        ("Recommended with a caveat", "Excellent for what I use it for. Check the dimensions carefully before ordering — it's larger than I pictured."),
    ],
    3: [
        ("Fine, not remarkable", "It works. Nothing about it stands out either way, which for the price is probably fair."),
        ("Mixed feelings", "Half of it is great and half is average. Still deciding whether I'd repurchase."),
        ("Does the job", "No faults, no delight. If you need this specific thing it'll serve you."),
    ],
    2: [
        ("Not for me", "Quality is acceptable but it doesn't suit how I work. Returns process was straightforward, to be fair."),
        ("Underwhelming", "Feels lighter and thinner than the photos suggest. Functional, but I expected more at this price."),
    ],
    1: [
        ("Arrived faulty", "Stopped working on the third day. Seller replaced it quickly, but I'd rather it had worked first time."),
    ],
}
