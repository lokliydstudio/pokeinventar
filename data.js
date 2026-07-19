const SETS = [
  ["151",24,349,22], ["Abyss Eye",7,999,13], ["Ancient Roar",2,929,4], ["Ascended Heroes",16,439,26],
  ["Battle Partners",4,999,8], ["Black Bolt",10,999,21], ["Blade Awakened",3,499,2], ["Blue Sky Stream",1,3799,1],
  ["Chaos Rising",26,99,23], ["Charizard ex",3,799,9], ["Combined Powers",1,1499,2], ["Crimson Haze",3,1549,5],
  ["Crystal Gathering",21,299,5], ["Cynthia's Garchomp",2,799,3], ["Dark Crystal Blaze",2,399,3], ["Destined Rivals",21,169,22],
  ["Eevee Heroes",2,2499,1], ["Eternal Birth",1,55,1], ["Final Flame Dance",1,599,1], ["First Partner",4,699,16],
  ["Future Flash",3,849,6], ["Gem Packs",10,499,8], ["Heat Wave Arena",2,1599,5], ["Inferno X",10,1829,13],
  ["Iono's Bellibolt",2,749,7], ["Journey Together",8,99,12], ["Kanto Friends",1,199.9,4], ["Mega Brave",10,1190,14],
  ["Mega Charizard X",6,499.9,13], ["Mega Charizard Y",1,699,8], ["Mega Dream",11,1299,16], ["Mega Evolution",4,129,19],
  ["Mega Greninja",11,749,14], ["Mega Lucario",3,699,11], ["Mega Specials",11,419,20], ["Mega Venusaur",4,899,12],
  ["Mega Zygarde",8,799,16], ["Nihil Zero",5,899,9], ["Ninja Spinner",9,1090,13], ["Obsidian Flames",2,130,5],
  ["Paldea Evolved",4,145,9], ["Paldean Fates",14,579,11], ["Paradise Dragona",1,2299,4], ["Paradox Rift",4,99,10],
  ["Paradox Veil",2,399,1], ["Perfect Order",21,85,25], ["Phantasmal Flames",9,179,18], ["Pitch Black",24,99,20],
  ["Poké Ball Tin",2,329,11], ["Primordial Arts",2,699,1], ["Prismatic Evolutions",13,479,15], ["Shiny Treasure ex",6,1899,9],
  ["Shrouded Fable",2,799,11], ["Snow Hazard",2,1299,4], ["Stellar Crown",2,1499,11], ["Stellar Crystal",2,449,2],
  ["Stellar Miracle",1,1299,5], ["Surging Sparks",4,319.9,11], ["Team Rocket",7,599,16], ["Temporal Forces",4,100,9],
  ["Terastal Festival",8,1899,9], ["Twilight Masquerade",7,155,13], ["VMAX Climax",5,2990,5], ["White Flare",7,999,20],
  ["30th Celebration",0,null,9,"2026-09-16"], ["Fearless Terastal",0,null,1], ["Mega Blaziken",0,null,1], ["Mega Gallade",0,null,1],
  ["Mega Heroes",0,null,5], ["Scarlet & Violet",0,null,1], ["Storm Emerald",0,null,1,"2026-09-01"]
].map(([name,stock,minPrice,stores,release]) => ({ name, stock, minPrice, stores, release }));

const STORES = [
  ["Pokestore",81,100,146], ["CardCenter",58,55,108], ["Playlot",36,89,36], ["Retroworld",27,99,142],
  ["PokeNordic",26,85,80], ["BoosterKongen",19,299,38], ["KanonCon",18,649,139], ["Pokebua",17,349,20],
  ["Cardhouse",13,179,69], ["Gamezone",12,99,12], ["Kortix",11,95,11], ["Spillmonster",11,449,37],
  ["TCG Masters",11,699,13], ["CardChimp",10,499,31], ["MaxGaming",10,349,73], ["EpiCards",8,849,96],
  ["TCG Norge",8,899,11], ["Collectors Corner",7,99,70], ["Nille",7,319.9,9], ["Pokebutikk",7,999,12],
  ["Cardstore",5,649,72], ["Game & Trade",4,999,7], ["Proshop",4,299,4], ["Norli",3,349,15],
  ["Pokelink",3,300,22], ["PokeShop",3,1399,27], ["Ringo",3,89.9,6], ["Tabletopbattle",3,99,3],
  ["Manaheim",2,129,74], ["Outland",1,1599,88], ["Extra Leker",0,null,10], ["Lekekassen",0,null,31],
  ["NorthTCG",0,null,32], ["Spillbua",0,null,7]
].map(([name,stock,minPrice,tracked]) => ({ name, stock, minPrice, tracked }));

const PALETTES = [
  ["#ef5967", "#f3a54a"], ["#5865d8", "#8f66d9"], ["#1c9b83", "#76cba6"], ["#c94d8b", "#7f57c9"],
  ["#e46736", "#e6bd42"], ["#3889bd", "#54c6d7"], ["#575b68", "#9a8eaa"], ["#8d573d", "#d0a866"],
  ["#333e86", "#e05f75"], ["#258c9a", "#73bd6a"], ["#a23f49", "#e08b53"], ["#6548a5", "#d16db7"]
];
