// Hand-drawn 24×24 test Punks (original pixel art in the CryptoPunks style).
// Each is a base head plus overlays. Overlay rows are [row, startCol, text]:
// '.' leaves the pixel as is, '_' clears it to background.

export interface TestPunk { name: string; rows: string[]; palette: Record<string, string> }

type Sparse = [number, number, string][];
const BG = '#638596';

const MALE: Sparse = [
  [7, 8, 'KKKKKKK'], [8, 7, 'KSSSSSSSK'],
  [9, 6, 'KSSSSSSSSSK'], [10, 6, 'KSSSSSSSSSK'], [11, 6, 'KSSSSSSSSSK'],
  [12, 5, 'KSSSSSSSSSSK'], [13, 5, 'KSSSWKSSSWKK'], [14, 5, 'KSSSSSSSSSSK'],
  [15, 6, 'KSSSSSSSSSK'], [16, 6, 'KSSSSSSKSSK'], [17, 6, 'KSSSSSSSSSK'],
  [18, 6, 'KSSSSKKKKSK'], [19, 6, 'KSSSSSSSSSK'], [20, 7, 'KSSSSSSSK'],
  [21, 7, 'KSSKKKKKK'], [22, 7, 'KSSSSK'], [23, 7, 'KSSSSK'],
];
const FEMALE: Sparse = [
  [8, 8, 'KKKKKK'], [9, 7, 'KSSSSSSK'],
  [10, 6, 'KSSSSSSSSK'], [11, 6, 'KSSSSSSSSK'], [12, 6, 'KSSSSSSSSK'],
  [13, 6, 'KSSWKSSWKK'], [14, 6, 'KSSSSSSSSK'], [15, 6, 'KSSSSSKSSK'],
  [16, 6, 'KSSSSSSSSK'], [17, 6, 'KSSSSRRSSK'], [18, 7, 'KSSSSSSK'],
  [19, 8, 'KSSSSK'], [20, 8, 'KSSK'], [21, 8, 'KSSK'], [22, 8, 'KSSK'], [23, 8, 'KSSK'],
];

const ACC: Record<string, Sparse> = {
  cap: [[5, 8, 'CCCCCCC'], [6, 7, 'CCCCCCCCC'], [7, 6, 'CCCCCCCCCCCCCC'], [8, 6, 'KCCCCCCCCCCCCCC']],
  beanie: [[5, 9, 'NNNN'], [6, 8, 'NNNNNNN'], [7, 7, 'NNNNNNNNN'], [8, 6, 'NNNNNNNNNNN'], [9, 6, 'NnNnNnNnNnN']],
  longhair: [[7, 7, 'HHHHHHH'], [8, 6, 'HHHHHHHHH'], [9, 5, 'HHHHHHHHHH'],
    ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map(r => [r, 5, 'HHH'] as [number, number, string])],
  pipe: [[18, 19, 'BB'], [19, 17, 'PPBB'], [20, 19, 'BB'], [15, 19, 'm'], [16, 20, 'm']],
  cigarette: [[19, 17, 'wwwwo'], [15, 21, 'm'], [16, 21, 'm'], [17, 21, 'm']],
  vr: [[12, 5, 'VVVVVVVVVVVVVV'], [13, 5, 'VVvvvvvvvvvvVVV'], [14, 5, 'VVVVVVVVVVVVVV']],
  hoodie: [[5, 7, 'XXXXXXXX'], [6, 6, 'XXXXXXXXXX'], [7, 5, 'XXXXXXXXXXXX'],
    ...[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(r => [r, 4, 'XXX'] as [number, number, string]),
    [8, 17, 'X'], [9, 17, 'X'], [10, 17, 'X'], [21, 4, 'XXX'], [22, 4, 'XXXXXXXXXXXXX'], [23, 4, 'XXXXXXXXXXXXX']],
  glasses3d: [[12, 6, 'KKKKKKKKKKK'], [13, 6, 'KRRRKKBBBKK'], [14, 6, 'KKKKKKKKKKK']],
  tophat: [[1, 8, 'KKKKKKK'], [2, 8, 'KTTTTTK'], [3, 8, 'KTTTTTK'], [4, 8, 'KTTTTTK'], [5, 8, 'KrrrrrK'], [6, 5, 'KKKKKKKKKKKKK'], [7, 5, 'KTTTTTTTTTTTK'], [8, 5, 'KKKKKKKKKKKKK']],
  mohawk: [[2, 10, 'HH'], [3, 10, 'HH'], [4, 10, 'HH'], [5, 10, 'HH'], [6, 10, 'HH'], [7, 10, 'HH']],
  beard: [[16, 7, 'BBBBBB'], [17, 6, 'KBBBBBBBBBK'], [18, 6, 'KBBBBKKKKBK'], [19, 6, 'KBBBBBBBBBK'], [20, 7, 'KBBBBBBBK'], [21, 7, 'KBBKKKKKK']],
  headband: [[9, 6, 'KDDDDDDDDDK']],
  wildhair: [[3, 7, 'H.H.H.H'], [4, 6, 'HHHHHHHHHH'], [5, 5, 'HHHHHHHHHHHH'], [6, 4, 'HHHHHHHHHHHHHH'], [7, 5, 'HHHHHHHHHHHHH'], [8, 4, 'HHHH'], [9, 5, 'HH'], [10, 4, 'HHH'], [8, 16, 'HH'], [9, 17, 'H']],
  pigtails: [[7, 7, 'HHHHHHH'], [8, 6, 'HHHHHHHHH'], [9, 5, 'HHHHHHHHHH'], [10, 3, 'HHHH'], [11, 2, 'HHHH'], [12, 2, 'HHH'], [13, 3, 'HH'], [10, 16, 'H']],
  cowboy: [[3, 9, 'LLLLL'], [4, 8, 'LLLLLLL'], [5, 8, 'LLLLLLL'], [6, 8, 'LdddddL'], [7, 3, 'LLLLLLLLLLLLLLLLLL'], [8, 7, 'LLLLLLLLL']],
  earring: [[16, 4, 'Y']],
  tiara: [[6, 10, 'Y.Y'], [7, 9, 'YYYYY']],
  zombieEyes: [[13, 5, 'KSSSrKSSSrKK']],
};

function compose(base: Sparse, ...overlays: Sparse[]): string[] {
  const g = Array.from({ length: 24 }, () => Array(24).fill('.'));
  for (const layer of [base, ...overlays]) for (const [r, c0, s] of layer) {
    [...s].forEach((ch, i) => {
      const c = c0 + i;
      if (c < 0 || c > 23) throw new Error(`overlay out of bounds at row ${r}`);
      if (ch === '.') return;
      g[r][c] = ch === '_' ? '.' : ch;
    });
  }
  return g.map(r => r.join(''));
}

const common = { '.': BG, K: '#000000', W: '#E8E8E8', R: '#C02020', m: '#8C9CA6' };
const SKIN = { light: '#DBB180', medium: '#AE8B61', dark: '#713F1D', albino: '#EAD9D9', zombie: '#7DA269', ape: '#856F56', alien: '#C8FBFB' };

function punk(name: string, base: Sparse, skin: string, accs: string[], extra: Record<string, string> = {}): TestPunk {
  return { name, rows: compose(base, ...accs.map(a => ACC[a])), palette: { ...common, S: skin, ...extra } };
}

export const TEST_PUNKS: TestPunk[] = [
  punk('cap', MALE, SKIN.medium, ['cap'], { C: '#C42110' }),
  punk('beanie', MALE, SKIN.light, ['beanie'], { N: '#1C4FA0', n: '#2F6DD0' }),
  punk('long-hair-woman', FEMALE, SKIN.light, ['longhair'], { H: '#FFF68E' }),
  punk('pipe', MALE, SKIN.dark, ['pipe'], { P: '#553000', B: '#855114' }),
  punk('cigarette', MALE, SKIN.medium, ['cigarette'], { w: '#EFEFEF', o: '#E05A00' }),
  punk('vr', MALE, SKIN.light, ['vr'], { V: '#B4B4B4', v: '#5D5D5D' }),
  punk('hoodie', MALE, SKIN.medium, ['hoodie'], { X: '#555555' }),
  punk('zombie', MALE, SKIN.zombie, ['zombieEyes', 'headband'], { r: '#FF2B2B', D: '#2A3F9E' }),
  punk('alien-cap', MALE, SKIN.alien, ['cap'], { C: '#2A2A2A' }),
  punk('ape-beanie', MALE, SKIN.ape, ['beanie'], { N: '#C42110', n: '#E03020' }),
  punk('3d-glasses', MALE, SKIN.albino, ['glasses3d'], { B: '#2266CC' }),
  punk('top-hat', MALE, SKIN.medium, ['tophat'], { T: '#1A1A1A', r: '#B01010' }),
  punk('mohawk', MALE, SKIN.light, ['mohawk'], { H: '#D11AB0' }),
  punk('beard-headband', MALE, SKIN.dark, ['beard', 'headband'], { B: '#3B2A1A', D: '#FFFFFF' }),
  punk('wild-hair-woman', FEMALE, SKIN.medium, ['wildhair'], { H: '#E8A24A' }),
  punk('pigtails-woman', FEMALE, SKIN.albino, ['pigtails', 'earring'], { H: '#A63A1E', Y: '#FFD926' }),
  punk('cowboy-hat', MALE, SKIN.light, ['cowboy'], { L: '#7A4A21', d: '#3B2210' }),
  punk('tiara-woman', FEMALE, SKIN.dark, ['tiara', 'earring'], { Y: '#FFD926' }),
  punk('alien-pipe', MALE, SKIN.alien, ['pipe'], { P: '#553000', B: '#855114' }),
];

/** John's Punk, from cryptopunk-brick-bust/model/punk_pixels.json. */
export const REFERENCE_PUNK: TestPunk = {
  name: 'reference',
  rows: ['........................', '........................', '........................', '........................', '........CCCCCCC.........', '.......CCCCCCLCC........', '......CCCCCCCCLC........', '......CCCCCCCCCCCCC.....', '......CCCCCCCCCCCCCC....', '......KSSSSSSSSSK.......', '......KSKKKKSKKKK.......', '......KKKGGKKKGGK.......', '.....KSSKGGKSKGGK.......', '.....KSSKKKKSKKKK.......', '.....KKSSSSSSSSSK.......', '......KSSSSSKKSSK.......', '......KSSBBBBBBBK.......', '......KBBBBBBBBBBK......', '.....KBBBBBKKKBBBK......', '.....KBBBBBBBBBBBK......', '.....KBBBBBBBBBBBK......', '......KKBBBBBBBBBK......', '......KSKKKBBBBBK.......', '......KSSSKKKKKK........'],
  palette: { '.': '#6B8494', K: '#000000', S: '#A98D67', B: '#9D7139', C: '#7623B0', L: '#A865D4', G: '#96D9DA' },
};
