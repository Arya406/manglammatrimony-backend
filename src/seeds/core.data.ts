// ==============================================================================
// Manglam Matrimony — Core Reference Master Data
// Tracked, canonical definitions for Religions, Languages, Educations, and Employment Statuses
// ==============================================================================

export interface ReligionSeedItem {
  name: string;
  slug: string;
  sortOrder: number;
}

export interface LanguageSeedItem {
  name: string;
  code: string;
  sortOrder: number;
}

export interface EducationSeedItem {
  name: string;
  slug: string;
  sortOrder: number;
}

export interface EmploymentStatusSeedItem {
  name: string;
  slug: string;
  sortOrder: number;
}

export const RELIGIONS_DATA: ReligionSeedItem[] = [
  { name: "Hindu", slug: "hindu", sortOrder: 1 },
  { name: "Muslim", slug: "muslim", sortOrder: 2 },
  { name: "Christian", slug: "christian", sortOrder: 3 },
  { name: "Sikh", slug: "sikh", sortOrder: 4 },
  { name: "Jain", slug: "jain", sortOrder: 5 },
  { name: "Buddhist", slug: "buddhist", sortOrder: 6 },
  { name: "Parsi", slug: "parsi", sortOrder: 7 },
  { name: "Jewish", slug: "jewish", sortOrder: 8 },
  { name: "Other", slug: "other", sortOrder: 9 },
  { name: "Prefer not to say", slug: "prefer-not-to-say", sortOrder: 10 },
];

export const LANGUAGES_DATA: LanguageSeedItem[] = [
  { name: "Hindi", code: "hi", sortOrder: 1 },
  { name: "English", code: "en", sortOrder: 2 },
  { name: "Bengali", code: "bn", sortOrder: 3 },
  { name: "Telugu", code: "te", sortOrder: 4 },
  { name: "Marathi", code: "mr", sortOrder: 5 },
  { name: "Tamil", code: "ta", sortOrder: 6 },
  { name: "Urdu", code: "ur", sortOrder: 7 },
  { name: "Gujarati", code: "gu", sortOrder: 8 },
  { name: "Kannada", code: "kn", sortOrder: 9 },
  { name: "Odia", code: "or", sortOrder: 10 },
  { name: "Malayalam", code: "ml", sortOrder: 11 },
  { name: "Punjabi", code: "pa", sortOrder: 12 },
  { name: "Assamese", code: "as", sortOrder: 13 },
  { name: "Maithili", code: "mai", sortOrder: 14 },
  { name: "Sanskrit", code: "sa", sortOrder: 15 },
  { name: "Marwari", code: "mwr", sortOrder: 16 },
  { name: "Sindhi", code: "sd", sortOrder: 17 },
  { name: "Konkani", code: "kok", sortOrder: 18 },
  { name: "Kashmiri", code: "ks", sortOrder: 19 },
  { name: "Dogri", code: "doi", sortOrder: 20 },
  { name: "Other", code: "other", sortOrder: 21 },
];

export const EDUCATIONS_DATA: EducationSeedItem[] = [
  { name: "10th", slug: "10th", sortOrder: 1 },
  { name: "12th", slug: "12th", sortOrder: 2 },
  { name: "Diploma", slug: "diploma", sortOrder: 3 },
  { name: "B.A.", slug: "ba", sortOrder: 4 },
  { name: "B.Sc.", slug: "bsc", sortOrder: 5 },
  { name: "B.Com.", slug: "bcom", sortOrder: 6 },
  { name: "BBA", slug: "bba", sortOrder: 7 },
  { name: "BCA", slug: "bca", sortOrder: 8 },
  { name: "B.E.", slug: "be", sortOrder: 9 },
  { name: "B.Tech.", slug: "btech", sortOrder: 10 },
  { name: "M.A.", slug: "ma", sortOrder: 11 },
  { name: "M.Sc.", slug: "msc", sortOrder: 12 },
  { name: "M.Com.", slug: "mcom", sortOrder: 13 },
  { name: "MBA", slug: "mba", sortOrder: 14 },
  { name: "MCA", slug: "mca", sortOrder: 15 },
  { name: "M.E.", slug: "me", sortOrder: 16 },
  { name: "M.Tech.", slug: "mtech", sortOrder: 17 },
  { name: "MBBS", slug: "mbbs", sortOrder: 18 },
  { name: "BDS", slug: "bds", sortOrder: 19 },
  { name: "LLB", slug: "llb", sortOrder: 20 },
  { name: "LLM", slug: "llm", sortOrder: 21 },
  { name: "CA", slug: "ca", sortOrder: 22 },
  { name: "CS", slug: "cs", sortOrder: 23 },
  { name: "PhD", slug: "phd", sortOrder: 24 },
  { name: "Other", slug: "other", sortOrder: 25 },
];

export const EMPLOYMENT_STATUSES_DATA: EmploymentStatusSeedItem[] = [
  { name: "Employed", slug: "employed", sortOrder: 1 },
  { name: "Self Employed", slug: "self-employed", sortOrder: 2 },
  { name: "Business Owner", slug: "business-owner", sortOrder: 3 },
  { name: "Entrepreneur", slug: "entrepreneur", sortOrder: 4 },
  { name: "Government Employee", slug: "government-employee", sortOrder: 5 },
  { name: "Defence", slug: "defence", sortOrder: 6 },
  { name: "Student", slug: "student", sortOrder: 7 },
  { name: "Not Working", slug: "not-working", sortOrder: 8 },
  { name: "Retired", slug: "retired", sortOrder: 9 },
  { name: "Other", slug: "other", sortOrder: 10 },
];
