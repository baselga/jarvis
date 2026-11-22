import type { Role } from '@jarvis/schemas';

// Datos de ejemplo para desarrollo (`pnpm db:sample`). Solo datos: `sample.ts` los inserta.
// Los libros referencian autores, géneros y saga por nombre, y préstamos y lecturas el libro
// por título; los tipos literales hacen que una errata no compile. Las fechas son «hace N
// días» para que los datos no envejezcan. Los ISBN son ilustrativos.

export const SAMPLE_PASSWORD = 'jarvis-dev';

export const SAMPLE_USERS = {
  adult: { name: 'Lucía', email: 'adulto@jarvis.local', role: 'adult' },
  guest: { name: 'Invitados', email: 'invitado@jarvis.local', role: 'guest' },
} as const satisfies Record<string, { name: string; email: string; role: Role }>;

export const SAMPLE_EMAILS = Object.values(SAMPLE_USERS).map((user) => user.email);

export const SAMPLE_AUTHORS = [
  'Gabriel García Márquez',
  'Carmen Martín Gaite',
  'Antonio Muñoz Molina',
  'Fernando Aramburu',
  'Isabel Allende',
  'Julio Cortázar',
  'Jorge Luis Borges',
  'Juan Rulfo',
  'Carmen Laforet',
  'Camilo José Cela',
  'Miguel Delibes',
  'Pablo Neruda',
  'Federico García Lorca',
  'Yuval Noah Harari',
  'Irene Vallejo',
  'George Orwell',
  'Frank Herbert',
  'J. R. R. Tolkien',
  'Elvira Lindo',
  'Terry Pratchett',
  'Neil Gaiman',
  'Antoine de Saint-Exupéry',
  'Miguel de Cervantes',
  'Carlos Ruiz Zafón',
  'J. K. Rowling',
  'Isaac Asimov',
  'Brandon Sanderson',
  'Eva García Sáenz de Urturi',
] as const;

export const SAMPLE_GENRES = [
  'Novela',
  'Clásicos',
  'Ciencia ficción',
  'Fantasía',
  'Novela negra',
  'Ensayo',
  'Historia',
  'Poesía',
  'Infantil',
] as const;

export const SAMPLE_SAGAS = [
  'El Cementerio de los Libros Olvidados',
  'Harry Potter',
  'Fundación',
  'El Archivo de las Tormentas',
  'Trilogía de la Ciudad Blanca',
] as const;

export interface SampleBook {
  title: string;
  authors: readonly (typeof SAMPLE_AUTHORS)[number][];
  genres: readonly (typeof SAMPLE_GENRES)[number][];
  saga?: { name: (typeof SAMPLE_SAGAS)[number]; order: number };
  isbn?: string;
  year?: number;
  language?: string;
  location?: string;
  notes?: string;
}

// `as const` para sacar el tipo de los títulos; fuera se expone como `SampleBook[]`.
const books = [
  // Sagas. Del Cementerio falta el 2 (hueco en el orden); «Danzante del filo» es el 2.5.
  {
    title: 'La sombra del viento',
    authors: ['Carlos Ruiz Zafón'],
    genres: ['Novela'],
    saga: { name: 'El Cementerio de los Libros Olvidados', order: 1 },
    isbn: '9788408163435',
    year: 2001,
    language: 'es',
    location: 'Salón, estantería 1',
  },
  {
    title: 'El prisionero del cielo',
    authors: ['Carlos Ruiz Zafón'],
    genres: ['Novela'],
    saga: { name: 'El Cementerio de los Libros Olvidados', order: 3 },
    year: 2011,
    language: 'es',
    location: 'Salón, estantería 1',
  },
  {
    title: 'El laberinto de los espíritus',
    authors: ['Carlos Ruiz Zafón'],
    genres: ['Novela'],
    saga: { name: 'El Cementerio de los Libros Olvidados', order: 4 },
    year: 2016,
    language: 'es',
    location: 'Salón, estantería 1',
  },
  {
    title: 'Harry Potter y la piedra filosofal',
    authors: ['J. K. Rowling'],
    genres: ['Fantasía', 'Infantil'],
    saga: { name: 'Harry Potter', order: 1 },
    isbn: '9788478884452',
    year: 1997,
    language: 'es',
    location: 'Habitación de los niños',
  },
  {
    title: 'Harry Potter y la cámara secreta',
    authors: ['J. K. Rowling'],
    genres: ['Fantasía', 'Infantil'],
    saga: { name: 'Harry Potter', order: 2 },
    year: 1998,
    language: 'es',
    location: 'Habitación de los niños',
  },
  {
    title: 'Harry Potter y el prisionero de Azkaban',
    authors: ['J. K. Rowling'],
    genres: ['Fantasía', 'Infantil'],
    saga: { name: 'Harry Potter', order: 3 },
    year: 1999,
    language: 'es',
    location: 'Habitación de los niños',
  },
  {
    title: 'Fundación',
    authors: ['Isaac Asimov'],
    genres: ['Ciencia ficción', 'Clásicos'],
    saga: { name: 'Fundación', order: 1 },
    year: 1951,
    language: 'es',
    location: 'Estudio',
  },
  {
    title: 'Fundación e Imperio',
    authors: ['Isaac Asimov'],
    genres: ['Ciencia ficción', 'Clásicos'],
    saga: { name: 'Fundación', order: 2 },
    year: 1952,
    language: 'es',
    location: 'Estudio',
  },
  {
    title: 'Segunda Fundación',
    authors: ['Isaac Asimov'],
    genres: ['Ciencia ficción', 'Clásicos'],
    saga: { name: 'Fundación', order: 3 },
    year: 1953,
    language: 'es',
    location: 'Estudio',
  },
  {
    title: 'El camino de los reyes',
    authors: ['Brandon Sanderson'],
    genres: ['Fantasía'],
    saga: { name: 'El Archivo de las Tormentas', order: 1 },
    year: 2010,
    language: 'es',
    location: 'Estudio',
    notes: 'Edición en tapa dura, pesa un quintal.',
  },
  {
    title: 'Palabras radiantes',
    authors: ['Brandon Sanderson'],
    genres: ['Fantasía'],
    saga: { name: 'El Archivo de las Tormentas', order: 2 },
    year: 2014,
    language: 'es',
    location: 'Estudio',
  },
  {
    title: 'Danzante del filo',
    authors: ['Brandon Sanderson'],
    genres: ['Fantasía'],
    saga: { name: 'El Archivo de las Tormentas', order: 2.5 },
    year: 2016,
    language: 'es',
    location: 'Estudio',
    notes: 'Novela corta entre el 2 y el 3.',
  },
  {
    title: 'Juramentada',
    authors: ['Brandon Sanderson'],
    genres: ['Fantasía'],
    saga: { name: 'El Archivo de las Tormentas', order: 3 },
    year: 2017,
    language: 'es',
    location: 'Estudio',
  },
  {
    title: 'El silencio de la ciudad blanca',
    authors: ['Eva García Sáenz de Urturi'],
    genres: ['Novela negra'],
    saga: { name: 'Trilogía de la Ciudad Blanca', order: 1 },
    year: 2016,
    language: 'es',
    location: 'Dormitorio',
  },
  {
    title: 'Los ritos del agua',
    authors: ['Eva García Sáenz de Urturi'],
    genres: ['Novela negra'],
    saga: { name: 'Trilogía de la Ciudad Blanca', order: 2 },
    year: 2017,
    language: 'es',
    location: 'Dormitorio',
  },
  {
    title: 'Los señores del tiempo',
    authors: ['Eva García Sáenz de Urturi'],
    genres: ['Novela negra'],
    saga: { name: 'Trilogía de la Ciudad Blanca', order: 3 },
    year: 2018,
    language: 'es',
    location: 'Mesilla de noche',
  },

  // Sueltos.
  {
    title: 'Cien años de soledad',
    authors: ['Gabriel García Márquez'],
    genres: ['Novela', 'Clásicos'],
    isbn: '9788497592208',
    year: 1967,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'El amor en los tiempos del cólera',
    authors: ['Gabriel García Márquez'],
    genres: ['Novela'],
    year: 1985,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'Crónica de una muerte anunciada',
    authors: ['Gabriel García Márquez'],
    genres: ['Novela'],
    year: 1981,
  },
  {
    title: 'Entre visillos',
    authors: ['Carmen Martín Gaite'],
    genres: ['Novela'],
    year: 1958,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'El cuarto de atrás',
    authors: ['Carmen Martín Gaite'],
    genres: ['Novela'],
    year: 1978,
    language: 'es',
  },
  {
    title: 'Plenilunio',
    authors: ['Antonio Muñoz Molina'],
    genres: ['Novela', 'Novela negra'],
    year: 1997,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'El jinete polaco',
    authors: ['Antonio Muñoz Molina'],
    genres: ['Novela'],
    year: 1991,
    language: 'es',
  },
  {
    title: 'Patria',
    authors: ['Fernando Aramburu'],
    genres: ['Novela'],
    isbn: '9788490663196',
    year: 2016,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'La casa de los espíritus',
    authors: ['Isabel Allende'],
    genres: ['Novela'],
    year: 1982,
    language: 'es',
    location: 'Dormitorio',
  },
  {
    title: 'Rayuela',
    authors: ['Julio Cortázar'],
    genres: ['Novela', 'Clásicos'],
    year: 1963,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'Ficciones',
    authors: ['Jorge Luis Borges'],
    genres: ['Clásicos'],
    year: 1944,
    language: 'es',
  },
  {
    title: 'Pedro Páramo',
    authors: ['Juan Rulfo'],
    genres: ['Novela', 'Clásicos'],
    year: 1955,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'Nada',
    authors: ['Carmen Laforet'],
    genres: ['Novela', 'Clásicos'],
    year: 1945,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'La colmena',
    authors: ['Camilo José Cela'],
    genres: ['Novela', 'Clásicos'],
    year: 1951,
  },
  {
    title: 'Los santos inocentes',
    authors: ['Miguel Delibes'],
    genres: ['Novela'],
    year: 1981,
    language: 'es',
    location: 'Salón, estantería 2',
  },
  {
    title: 'Veinte poemas de amor y una canción desesperada',
    authors: ['Pablo Neruda'],
    genres: ['Poesía'],
    year: 1924,
    language: 'es',
    location: 'Mesilla de noche',
  },
  {
    title: 'Poeta en Nueva York',
    authors: ['Federico García Lorca'],
    genres: ['Poesía'],
    year: 1940,
    language: 'es',
  },
  {
    title: 'Sapiens. De animales a dioses',
    authors: ['Yuval Noah Harari'],
    genres: ['Ensayo', 'Historia'],
    isbn: '9788499926223',
    year: 2011,
    language: 'es',
    location: 'Estudio',
  },
  {
    title: 'El infinito en un junco',
    authors: ['Irene Vallejo'],
    genres: ['Ensayo', 'Historia'],
    year: 2019,
    language: 'es',
    location: 'Estudio',
    notes: 'Regalo de cumpleaños, dedicado.',
  },
  {
    title: '1984',
    authors: ['George Orwell'],
    genres: ['Ciencia ficción', 'Clásicos'],
    year: 1949,
    language: 'es',
    location: 'Estudio',
  },
  {
    title: 'Dune',
    authors: ['Frank Herbert'],
    genres: ['Ciencia ficción'],
    year: 1965,
    language: 'en',
    location: 'Estudio',
    notes: 'En inglés.',
  },
  {
    title: 'El hobbit',
    authors: ['J. R. R. Tolkien'],
    genres: ['Fantasía', 'Infantil'],
    year: 1937,
    language: 'es',
    location: 'Habitación de los niños',
  },
  {
    title: 'Manolito Gafotas',
    authors: ['Elvira Lindo'],
    genres: ['Infantil'],
    year: 1994,
    language: 'es',
    location: 'Habitación de los niños',
  },
  {
    title: 'Buenos presagios',
    authors: ['Terry Pratchett', 'Neil Gaiman'],
    genres: ['Fantasía'],
    year: 1990,
    language: 'es',
    location: 'Estudio',
  },
  // Sin género.
  {
    title: 'El principito',
    authors: ['Antoine de Saint-Exupéry'],
    genres: [],
    year: 1943,
    language: 'es',
    location: 'Habitación de los niños',
  },
  {
    title: 'Don Quijote de la Mancha',
    authors: ['Miguel de Cervantes'],
    genres: ['Novela', 'Clásicos'],
    year: 1605,
    language: 'es',
    location: 'Salón, estantería 1',
    notes: 'Edición del IV centenario.',
  },
] as const satisfies readonly SampleBook[];

type BookTitle = (typeof books)[number]['title'];

export const SAMPLE_BOOKS: readonly SampleBook[] = books;

// Sin `returnedDaysAgo` = activo (como mucho uno por libro).
export interface SampleLoan {
  book: BookTitle;
  borrower: string;
  loanedDaysAgo: number;
  returnedDaysAgo?: number;
}

export const SAMPLE_LOANS: readonly SampleLoan[] = [
  {
    book: 'Cien años de soledad',
    borrower: 'Marta (vecina)',
    loanedDaysAgo: 400,
    returnedDaysAgo: 380,
  },
  {
    book: 'Cien años de soledad',
    borrower: 'Abuela Carmen',
    loanedDaysAgo: 200,
    returnedDaysAgo: 150,
  },
  { book: 'Cien años de soledad', borrower: 'Javi (trabajo)', loanedDaysAgo: 20 },
  {
    book: 'La sombra del viento',
    borrower: 'Abuela Carmen',
    loanedDaysAgo: 300,
    returnedDaysAgo: 250,
  },
  { book: 'Patria', borrower: 'Tío Luis', loanedDaysAgo: 90, returnedDaysAgo: 40 },
  { book: 'Dune', borrower: 'Javi (trabajo)', loanedDaysAgo: 120, returnedDaysAgo: 60 },
  { book: 'El hobbit', borrower: 'Primo Dani', loanedDaysAgo: 180, returnedDaysAgo: 150 },
  { book: 'Harry Potter y la piedra filosofal', borrower: 'Primo Dani', loanedDaysAgo: 15 },
  { book: 'Sapiens. De animales a dioses', borrower: 'Marta (vecina)', loanedDaysAgo: 45 },
  { book: 'Plenilunio', borrower: 'Tío Luis', loanedDaysAgo: 7 },
];

// Al menos una de las dos fechas (lo exige la BD); sin `finishedDaysAgo` = leyendo.
// `admin`: el primer admin activo; si no hay, esas lecturas se omiten.
export interface SampleReading {
  book: BookTitle;
  reader: 'adult' | 'admin';
  startedDaysAgo?: number;
  finishedDaysAgo?: number;
  rating?: number;
  note?: string;
}

export const SAMPLE_READINGS: readonly SampleReading[] = [
  {
    book: 'Cien años de soledad',
    reader: 'adult',
    startedDaysAgo: 600,
    finishedDaysAgo: 560,
    rating: 5,
    note: 'Releído; mejor que la primera vez.',
  },
  {
    book: 'La sombra del viento',
    reader: 'adult',
    startedDaysAgo: 500,
    finishedDaysAgo: 480,
    rating: 5,
  },
  {
    book: 'El prisionero del cielo',
    reader: 'adult',
    startedDaysAgo: 440,
    finishedDaysAgo: 430,
    rating: 3,
  },
  {
    book: 'El laberinto de los espíritus',
    reader: 'adult',
    startedDaysAgo: 420,
    finishedDaysAgo: 390,
    rating: 4,
  },
  {
    book: 'Patria',
    reader: 'adult',
    startedDaysAgo: 365,
    finishedDaysAgo: 330,
    rating: 5,
    note: 'Duro pero imprescindible.',
  },
  {
    book: 'El silencio de la ciudad blanca',
    reader: 'adult',
    startedDaysAgo: 300,
    finishedDaysAgo: 290,
    rating: 4,
  },
  {
    book: 'Los ritos del agua',
    reader: 'adult',
    startedDaysAgo: 285,
    finishedDaysAgo: 270,
    rating: 4,
  },
  { book: 'Los señores del tiempo', reader: 'adult', startedDaysAgo: 12 },
  {
    book: 'El infinito en un junco',
    reader: 'adult',
    startedDaysAgo: 200,
    finishedDaysAgo: 170,
    rating: 5,
  },
  // Leído hace años: no recuerda cuándo empezó.
  { book: 'Entre visillos', reader: 'adult', finishedDaysAgo: 700, rating: 4 },
  { book: 'Nada', reader: 'adult', startedDaysAgo: 250, finishedDaysAgo: 240, rating: 4 },
  {
    book: 'El camino de los reyes',
    reader: 'adult',
    startedDaysAgo: 150,
    finishedDaysAgo: 110,
    rating: 5,
  },
  {
    book: 'Palabras radiantes',
    reader: 'adult',
    startedDaysAgo: 105,
    finishedDaysAgo: 70,
    rating: 5,
  },
  {
    book: 'Danzante del filo',
    reader: 'adult',
    startedDaysAgo: 65,
    finishedDaysAgo: 60,
    rating: 3,
    note: 'Se puede saltar sin perderse nada.',
  },
  { book: 'Manolito Gafotas', reader: 'adult', startedDaysAgo: 30, finishedDaysAgo: 28 },
  {
    book: 'Cien años de soledad',
    reader: 'admin',
    startedDaysAgo: 900,
    finishedDaysAgo: 870,
    rating: 4,
  },
  { book: 'Dune', reader: 'admin', startedDaysAgo: 220, finishedDaysAgo: 190, rating: 5 },
  { book: 'Fundación', reader: 'admin', startedDaysAgo: 160, finishedDaysAgo: 150, rating: 4 },
  {
    book: 'Patria',
    reader: 'admin',
    startedDaysAgo: 120,
    finishedDaysAgo: 80,
    rating: 4,
    note: 'Me lo recomendó Lucía.',
  },
  { book: '1984', reader: 'admin', startedDaysAgo: 5 },
];
