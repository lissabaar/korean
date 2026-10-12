/**
 * Ready-made categories every account gets, filled with basic words:
 * numbers (native and Sino-Korean), colours, days and months, counters, and
 * so on. A beginner may know none of them, so they are on for learning by
 * default; anyone who knows them switches the category off or marks single
 * words "I know it".
 *
 * Library module: only data. Each word is the lemma plus a short English
 * gloss. The gloss is not stored as the meaning — it picks the right
 * dictionary entry among homographs (일: one / work / day) and the right
 * sense (seeding uses rankHomographs, like an import). Words the dictionary
 * does not have (set phrases like 안녕하세요) are saved with the gloss as
 * their English, marked source AI, exactly like an imported phrase.
 *
 * Seeding (adding them to an account) is in starter-seed.ts: new accounts
 * get them when they have no words yet. Words added here later reach an
 * existing account only by running the seed for it again (it is safe to
 * re-run: nothing is duplicated or removed).
 *
 * The category names match categories the owner already made by hand
 * ("colors", "action verbs", "descriptive verbs", "adverbs") — those are
 * filled, not duplicated. Korean has no "adjectives" in the English sense:
 * 형용사 are descriptive verbs (크다 "to be big"), hence the names.
 */

export interface StarterWord {
  lemma: string;
  /** English gloss: picks the homograph and sense; the meaning when the dictionary lacks the word. */
  gloss: string;
  /**
   * KRDict target code, when the gloss alone picks the wrong homograph
   * (개 "item" matched 개 "dog"; 년 "year" a slur). Written "@code" in the lists.
   */
  code?: string;
}

export interface StarterCategory {
  name: string;
  /** Bootstrap Icons name for the category. */
  icon: string;
  /**
   * Preferred KRDict part of speech: numbers are 수사 (else 이 "two" can come
   * out as a determiner, 하나 as "unity"), counters 의존 명사. Entries of that
   * part of speech are tried first; others only if there is none.
   */
  partOfSpeech?: string;
  words: StarterWord[];
}

/**
 * "하나 one, 개 item @22784" → StarterWord[]: compact to write, easy to read.
 * An "@code" at the end pins the KRDict entry.
 */
function list(text: string): StarterWord[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const pin = item.match(/\s@(\d+)$/);
      const rest = pin ? item.slice(0, pin.index) : item;
      const space = rest.indexOf(" ");
      return {
        lemma: rest.slice(0, space),
        gloss: rest.slice(space + 1).trim(),
        ...(pin && { code: pin[1] }),
      };
    });
}

/** Like list(), for phrases with spaces inside: "phrase | gloss; phrase | gloss". */
function phrases(text: string): StarterWord[] {
  return text
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [lemma, gloss] = item.split("|").map((part) => part.trim());
      return { lemma, gloss };
    });
}

export const STARTER_CATEGORIES: StarterCategory[] = [
  {
    // Native numbers count things and age; they stop at 99 (스물 아홉 = 29),
    // above that only Sino-Korean numbers exist.
    name: "native korean numbers",
    icon: "123",
    partOfSpeech: "수사",
    words: list(`하나 one, 둘 two, 셋 three, 넷 four, 다섯 five, 여섯 six, 일곱 seven, 여덟 eight,
      아홉 nine, 열 ten, 스물 twenty, 서른 thirty, 마흔 forty, 쉰 fifty, 예순 sixty, 일흔 seventy,
      여든 eighty, 아흔 ninety`),
  },
  {
    // Sino-Korean numbers: dates, money, phone numbers, minutes.
    name: "sino-korean numbers",
    icon: "calculator",
    partOfSpeech: "수사",
    words: list(`영 zero, 공 zero, 일 one, 이 two, 삼 three, 사 four, 오 five, 육 six, 칠 seven,
      팔 eight, 구 nine, 십 ten, 이십 twenty, 삼십 thirty, 사십 forty, 오십 fifty, 육십 sixty,
      칠십 seventy, 팔십 eighty, 구십 ninety, 백 hundred, 천 thousand, 만 ten thousand,
      십만 hundred thousand, 백만 million, 천만 ten million, 억 hundred million`),
  },
  {
    name: "colors",
    icon: "palette",
    words: list(`색 color, 빨간색 red, 주황색 orange, 노란색 yellow, 초록색 green, 파란색 blue,
      남색 navy, 보라색 purple, 분홍색 pink, 하늘색 sky blue, 갈색 brown, 회색 gray,
      검은색 black, 흰색 white, 금색 gold, 은색 silver, 빨갛다 red, 파랗다 blue, 노랗다 yellow,
      하얗다 white, 까맣다 black`),
  },
  {
    // 유월 and 시월 drop a consonant (육월, 십월 are wrong).
    name: "days and months",
    icon: "calendar3",
    words: list(`월요일 Monday, 화요일 Tuesday, 수요일 Wednesday, 목요일 Thursday, 금요일 Friday,
      토요일 Saturday, 일요일 Sunday, 주말 weekend, 평일 weekday, 일월 January, 이월 February,
      삼월 March, 사월 April, 오월 May, 유월 June, 칠월 July, 팔월 August, 구월 September,
      시월 October, 십일월 November, 십이월 December`),
  },
  {
    // Counters go with native numbers: 사과 두 개, 학생 세 명.
    name: "counters",
    icon: "hash",
    partOfSpeech: "의존 명사",
    words: list(`개 counter for things @22784, 명 counter for people, 마리 counter for animals,
      권 counter for books, 잔 counter for cups and glasses, 병 counter for bottles,
      장 counter for flat things (paper, tickets), 대 counter for vehicles and machines @40639,
      살 counter for age (years old), 번 counter for times, 켤레 counter for pairs (shoes, socks),
      벌 counter for clothes @59087, 송이 counter for flowers and bunches, 그릇 counter for bowls,
      층 counter for floors, 인분 counter for portions`),
  },
  {
    name: "time words",
    icon: "clock",
    words: list(`오늘 today, 내일 tomorrow, 어제 yesterday, 모레 day after tomorrow, 지금 now,
      요즘 these days, 아침 morning, 점심 lunch, 저녁 evening, 밤 night, 새벽 dawn, 오전 morning,
      오후 afternoon, 시 o'clock, 분 minute, 초 second, 시간 hour, 날 day, 주 week, 달 month,
      년 year @26823, 매일 every day`),
  },
  {
    name: "question words",
    icon: "question-lg",
    words: list(`누구 who, 무엇 what, 뭐 what, 언제 when, 어디 where, 왜 why, 어떻게 how,
      얼마 how much, 몇 how many, 어느 which, 무슨 what kind, 어떤 what kind`),
  },
  {
    name: "pronouns and pointers",
    icon: "person-raised-hand",
    words: list(`나 I, 저 I, 너 you, 우리 we, 저희 we, 그 he, 그녀 she, 이것 this, 그것 that,
      저것 that, 여기 here, 거기 there, 저기 over there`),
  },
  {
    name: "positions and directions",
    icon: "compass",
    words: list(`위 top, 아래 bottom, 밑 bottom, 앞 front, 뒤 back, 옆 side, 안 inside, 밖 outside,
      왼쪽 left, 오른쪽 right, 가운데 middle, 사이 between, 근처 nearby, 건너편 opposite side,
      동쪽 east, 서쪽 west, 남쪽 south, 북쪽 north`),
  },
  {
    // 형/오빠, 누나/언니 depend on who is speaking: a man says 형 and 누나.
    name: "family",
    icon: "people",
    words: list(`가족 family, 부모 parents, 아버지 father, 어머니 mother, 아빠 dad, 엄마 mom,
      형 older brother, 오빠 older brother, 누나 older sister, 언니 older sister,
      동생 younger sibling, 남동생 younger brother, 여동생 younger sister, 할아버지 grandfather,
      할머니 grandmother, 아들 son, 딸 daughter, 남편 husband, 아내 wife, 삼촌 uncle,
      이모 aunt, 고모 aunt, 사촌 cousin, 손자 grandson, 손녀 granddaughter`),
  },
  {
    name: "body parts",
    icon: "person-standing",
    words: list(`몸 body, 머리 head, 머리카락 hair, 얼굴 face, 눈 eye, 코 nose, 입 mouth, 귀 ear,
      이빨 tooth, 목 neck, 어깨 shoulder, 팔 arm, 손 hand, 손가락 finger, 가슴 chest, 배 belly,
      등 back, 허리 waist, 다리 leg, 무릎 knee, 발 foot, 발가락 toe, 피부 skin`),
  },
  {
    name: "polite phrases",
    icon: "chat-heart",
    words: phrases(`안녕하세요 | hello; 안녕히 가세요 | goodbye (to someone leaving);
      안녕히 계세요 | goodbye (when you are leaving); 감사합니다 | thank you; 고맙습니다 | thank you;
      죄송합니다 | I am sorry; 미안합니다 | sorry; 괜찮아요 | it is okay; 네 | yes; 아니요 | no;
      잠깐만요 | just a moment; 실례합니다 | excuse me; 처음 뵙겠습니다 | nice to meet you (first meeting);
      만나서 반갑습니다 | nice to meet you; 잘 먹겠습니다 | thank you for the meal (before eating);
      잘 먹었습니다 | thank you for the meal (after eating); 수고하셨습니다 | thank you for your hard work;
      축하합니다 | congratulations; 여보세요 | hello (on the phone); 주세요 | please give me`),
  },
  {
    // 동사: verbs of action.
    name: "action verbs",
    icon: "lightning",
    words: list(`가다 go, 오다 come, 먹다 eat, 마시다 drink, 보다 see, 듣다 listen, 말하다 speak,
      읽다 read, 쓰다 write, 하다 do, 자다 sleep, 일어나다 get up, 앉다 sit, 서다 stand,
      걷다 walk, 뛰다 run, 사다 buy, 팔다 sell, 주다 give, 받다 receive, 만나다 meet with,
      배우다 learn, 가르치다 teach, 알다 know, 모르다 not know, 좋아하다 like, 싫어하다 dislike,
      만들다 make, 열다 open, 닫다 shut, 기다리다 wait, 찾다 look for, 놀다 play, 일하다 work,
      공부하다 study, 생각하다 think, 입다 wear, 씻다 wash, 타다 ride, 살다 live`),
  },
  {
    // 형용사: in Korean these are verbs of state ("to be big"), not adjectives.
    name: "descriptive verbs",
    icon: "stars",
    words: list(`크다 big, 작다 small, 많다 many, 적다 few @62051, 좋다 good, 나쁘다 bad, 길다 long,
      짧다 short, 높다 high, 낮다 low, 넓다 wide, 좁다 narrow, 비싸다 expensive, 싸다 cheap,
      덥다 hot, 춥다 cold, 뜨겁다 hot, 차갑다 cold, 맛있다 delicious, 맛없다 tasteless,
      재미있다 fun, 재미없다 boring, 쉽다 easy, 어렵다 difficult, 빠르다 fast, 느리다 slow,
      예쁘다 pretty, 바쁘다 busy, 아프다 sick, 기쁘다 glad, 슬프다 sad, 피곤하다 tired,
      배고프다 hungry, 같다 same, 다르다 different, 있다 exist @68797, 없다 non-existent`),
  },
  {
    name: "adverbs",
    icon: "fast-forward",
    words: list(`아주 very, 매우 very, 너무 too, 정말 really, 진짜 really, 조금 a little, 많이 a lot,
      잘 well, 못 cannot @17254, 안 not, 더 more, 가장 most @26795, 제일 most, 빨리 quickly, 천천히 slowly,
      같이 together, 혼자 alone, 다시 again, 또 again, 벌써 already, 아직 yet, 곧 soon,
      항상 always, 자주 often, 가끔 sometimes, 먼저 first, 그리고 and, 그런데 but,
      그래서 so, 하지만 but`),
  },
  {
    name: "weather and seasons",
    icon: "cloud-sun",
    words: list(`날씨 weather, 계절 season, 봄 spring, 여름 summer, 가을 autumn, 겨울 winter,
      비 rain, 눈 snow, 바람 wind, 구름 cloud, 해 sun, 하늘 sky, 맑다 clear, 흐리다 foggy @89184,
      따뜻하다 warm, 시원하다 cool`),
  },
  {
    name: "basic food",
    icon: "egg-fried",
    words: list(`밥 rice, 물 water, 빵 bread, 고기 meat, 생선 fish, 채소 vegetable, 과일 fruit,
      사과 apple, 우유 milk, 커피 coffee, 차 tea, 계란 egg, 김치 kimchi, 국 soup, 라면 ramen,
      술 alcohol, 맥주 beer, 주스 juice, 소금 salt, 설탕 sugar`),
  },
];
