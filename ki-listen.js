// Begriffe der Erkennung: deutsch für die Anzeige, englisch für die KI. Ohne KI-Bibliothek, damit die Seite sie sofort hat.
// Nach jeder Änderung an den Listen: lokal index.html?begriffe-erzeugen öffnen, das schreibt app-begriffe.json neu.
// Herren-Arten und weitere Stoffe seit 18.11.2026, gemessen an 120 Fotos eines Herren-Kleiderschranks: Art 106 → 110/120,
// Ärmel 70 → 74/78, Farbe und Muster gleich; die 47 alten Fotos bei Art, Farbe, Muster unverändert. Verworfen, weil sie
// richtige Ergebnisse kippten: „Windjacke“ (Hemden auf dem Bügel wurden zu Jacken), „Overshirt“ (alle Hemden wurden dazu),
// „Cargohose“ (normale Hosen wurden dazu), „Piqué“ (zog Pullover und Sweatshirts an), „Sakko“ beim Blazer.
export const GROUPS = [
  ["Oberteile", [
    ["T-Shirt", ["t-shirt", "short-sleeved t-shirt", "plain crew neck t-shirt"]], ["Poloshirt", ["polo shirt", "short-sleeved polo shirt with a collar and buttons"]], ["Langarmshirt", ["long-sleeved top"]], ["Top", ["tank top"]],
    ["Bluse", ["blouse", "women's shirt"]], ["Hemd", ["button-up shirt", "long-sleeved shirt with buttons all the way down"]], ["Body", ["bodysuit"]], ["Pullover", ["sweater", "knitted sweater", "jumper", "quarter-zip pullover"]],
    ["Sweatshirt / Hoodie", ["sweatshirt", "hoodie"]], ["Strickjacke", ["cardigan"]], ["Weste", ["vest", "waistcoat"]]
  ]],
  ["Jacken & Mäntel", [["Blazer", ["blazer"]], ["Jacke", ["jacket"]], ["Steppjacke", ["puffer jacket", "quilted down jacket"]], ["Mantel", ["coat"]], ["Parka", ["parka with a hood"]]]],
  ["Unterteile", [
    ["Jeans", ["jeans"]], ["Hose", ["trousers", "pants"]], ["Leggings", ["leggings"]], ["Jogginghose", ["sweatpants"]],
    ["Shorts", ["shorts", "denim shorts"]], ["Rock", ["skirt"]]
  ]],
  ["Kleider & Einteiler", [["Kleid", ["dress"]], ["Jumpsuit", ["jumpsuit"]]]],
  ["Schuhe", [["Sneaker", ["sneakers"]], ["Sportschuhe", ["running shoes", "athletic trainers"]], ["Stiefel", ["boots"]], ["Halbschuhe", ["leather dress shoes", "derby shoes", "oxford shoes"]],
    ["Absatzschuhe", ["high heels"]], ["Flache Schuhe", ["ballet flats", "loafers"]], ["Sandalen", ["sandals", "slide sandals", "flip flops"]]]],
  ["Taschen", [["Tasche", ["handbag", "leather handbag", "crossbody bag", "belt bag"]], ["Rucksack", ["backpack with shoulder straps"]]]],
  ["Schmuck", [["Halskette", ["necklace"]], ["Ohrringe", ["earrings"]], ["Armband", ["bracelet"]], ["Ring", ["ring"]], ["Uhr", ["wristwatch"]]]],
  ["Haar", [["Haarschmuck", ["hair clip", "hairband"]]]],
  ["Accessoires", [["Gürtel", ["belt"]], ["Krawatte / Fliege", ["necktie", "bow tie"]], ["Schal / Tuch", ["scarf"]], ["Hut / Mütze", ["hat", "beanie", "baseball cap"]], ["Sonnenbrille", ["sunglasses"]], ["Handschuhe", ["gloves"]], ["Strumpfhose", ["tights"]]]],
  ["Bademode", [["Bikini / Badeanzug", ["bikini", "swimsuit"]], ["Badehose / Badeshorts", ["swim trunks", "board shorts"]]]]
];
export const GROUP_OF = new Map(GROUPS.flatMap(([g, arts]) => arts.map(([n]) => [n, g])));
export const MATERIALS = [
  ["Baumwolle", ["a garment made of cotton", "a garment made of soft cotton jersey, like a t-shirt"]],
  ["Denim / Jeansstoff", ["a garment made of denim"]],
  ["Strick / Wolle", ["a garment made of chunky knitted wool", "a garment made of fine ribbed knit"]],
  ["Leder", ["a garment made of smooth leather", "a shoe made of smooth leather"]],
  ["Wildleder", ["a garment made of suede", "a shoe made of matte suede"]],
  ["Seide / Satin", ["a garment made of shiny silk or satin"]],
  ["Leinen", ["a garment made of linen"]],
  ["Chiffon", ["a garment made of sheer chiffon"]],
  ["Spitze", ["a garment made of lace"]],
  ["Samt", ["a garment made of velvet"]],
  ["Cord", ["a garment made of corduroy with visible ridges"]],
  ["Tweed", ["a garment made of tweed"]],
  ["Synthetik, glänzend", ["a garment made of shiny synthetic fabric"]],
  ["Kunstfell / Teddy", ["a garment made of faux fur or teddy fleece"]],
  ["Sweatstoff / Fleece", ["a sweatshirt or hoodie made of soft cotton fleece"]],
  ["Nylon / Funktionsstoff", ["a shiny nylon windbreaker jacket", "a garment made of technical sports fabric"]],
  ["Steppstoff / Daunen", ["a puffer jacket made of quilted down padding"]],
  ["Mesh", ["a garment made of breathable mesh"]],
  ["Pailletten", ["a garment covered in sequins"]],
  ["Stroh / Bast", ["an item made of woven straw"]],
  ["Gummi / Kunststoff", ["a plastic hair accessory or rubber boots"]],
  ["Metall", ["a piece of metal jewelry"]]
];
export const PATTERNS = [
  ["Einfarbig", ["a plain solid-colored garment with no pattern", "a garment in a single plain color",
    "a plain ribbed knit garment in one color", "a plain cable knit sweater in one color", "a plain denim garment in one color",
    "a plain leather sneaker with small perforation holes", "a plain textured fabric garment in one color"]],
  ["Gestreift", ["a garment with stripes"]],
  ["Kariert", ["a garment with a plaid check pattern"]],
  ["Geblümt", ["a garment with a floral print"]],
  ["Gepunktet", ["a garment with polka dots"]],
  ["Animal-Print", ["a garment with a leopard animal print"]],
  ["Aufdruck / Logo", ["a garment with a large printed graphic on the front", "a t-shirt with a big logo or text print"]]
];
// [deutsch, englisch für die KI, Farbe für das Kästchen]
export const COLORS = [
  ["Schwarz", "black", [22, 22, 22]], ["Anthrazit", "charcoal grey", [66, 66, 70]], ["Grau", "grey", [128, 128, 128]], ["Hellgrau", "light grey", [190, 190, 192]],
  ["Weiß", "white", [246, 246, 244]], ["Creme", "cream", [238, 228, 204]], ["Beige", "beige", [214, 194, 164]], ["Taupe", "taupe", [150, 135, 120]],
  ["Camel", "camel", [190, 145, 95]], ["Braun", "brown", [110, 70, 42]], ["Dunkelbraun", "dark brown", [68, 44, 30]], ["Khaki", "khaki", [160, 150, 102]],
  ["Oliv", "olive green", [108, 108, 52]], ["Dunkelgrün", "dark green", [30, 80, 52]], ["Grün", "green", [62, 150, 72]], ["Mint", "mint green", [170, 220, 190]],
  ["Türkis", "turquoise", [60, 180, 180]], ["Hellblau", "light blue", [160, 200, 230]], ["Jeansblau", "denim blue", [82, 110, 150]], ["Blau", "blue", [42, 82, 182]],
  ["Dunkelblau", "navy blue", [30, 40, 80]], ["Lila", "purple", [120, 70, 150]], ["Flieder", "lilac", [190, 170, 215]], ["Rosa", "pink", [240, 182, 196]],
  ["Pink", "hot pink", [220, 60, 130]], ["Rot", "red", [200, 32, 40]], ["Bordeaux", "burgundy", [110, 26, 42]], ["Koralle", "coral", [240, 122, 100]],
  ["Orange", "orange", [235, 130, 40]], ["Senfgelb", "mustard yellow", [205, 165, 42]], ["Gelb", "yellow", [245, 215, 62]], ["Gold", "gold", [200, 166, 82]],
  // Silber seit 02.11.2026: gemessen an 32 Fotos (Schmuck, Taschen, Schuhe) Metall-Schmuck 15/15 statt 6/15 (vorher Hellgrau oder,
  // wegen des gespiegelten Holzbodens, Gold), Kleidung unverändert 45/47, Silber kam dort nie vor. Roségold machte die goldene Uhr zu Roségold → weggelassen.
  ["Silber", "silver", [196, 198, 204]]
];
// Ärmel: kurze „three-quarter“-Sätze zogen fast alles zu ¾, darum die genaueren Formulierungen
export const SLEEVES = [
  ["ärmellos", ["a sleeveless garment", "a garment with thin spaghetti straps", "a sleeveless vest"]],
  ["kurz", ["a garment with short sleeves", "a short-sleeved t-shirt"]],
  ["¾", ["a garment with elbow-length three-quarter sleeves"]],
  ["lang", ["a garment with long sleeves", "a long-sleeved top", "a garment with sleeves reaching the wrists", "a jacket or coat with long sleeves"]]
];
export const LEGS = [
  ["eng", ["tight skinny pants", "leggings"]],
  ["gerade", ["straight leg pants", "straight leg jeans"]],
  ["weit", ["wide leg pants", "wide leg jeans"]],
  ["Schlag", ["flared pants", "bootcut pants"]]
];
// Wo welches Merkmal passt
export const HAS_SLEEVES = new Set(["Oberteile", "Jacken & Mäntel", "Kleider & Einteiler"]);
export const HAS_LEGS = new Set(["Jeans", "Hose", "Leggings", "Jogginghose"]);
// Arten, deren Ärmel immer gleich sind: dort gilt diese Länge statt der KI-Schätzung (seit 18.11.2026)
export const AERMEL_FEST = { Weste: "ärmellos", Top: "ärmellos", "T-Shirt": "kurz", Poloshirt: "kurz", Langarmshirt: "lang" };
