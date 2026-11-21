import { describe, expect, it } from "vitest";
import { classifyReply } from "./reply-classifier";

describe("classifyReply", () => {
  const cases: Array<[string, string]> = [
    ["Please unsubscribe me from this list", "UNSUBSCRIBE"],
    ["Stop contacting me", "UNSUBSCRIBE"],
    ["I am currently out of the office, returning on Monday", "OUT_OF_OFFICE"],
    ["This is an automatic reply while I am away", "OUT_OF_OFFICE"],
    ["Sounds interesting, can we schedule a call?", "HOT"],
    ["This is too expensive for our current budget", "OBJECTION"],
    ["This is not a fit for us right now", "NOT_FIT"],
    ["Sounds good, tell me more", "WARM"],
    ["asdkjasd random text with no clear signal", "NEUTRAL"],
  ];

  it.each(cases)("classifies %j as %s", (text, expectedIntent) => {
    expect(classifyReply(text).intent).toBe(expectedIntent);
  });

  it("always marks UNSUBSCRIBE as not requiring human review", () => {
    const result = classifyReply("Please remove me from this list, unsubscribe");
    expect(result.intent).toBe("UNSUBSCRIBE");
    expect(result.flagForHuman).toBe(false);
  });

  it("flags HOT, OBJECTION, NOT_FIT and WARM replies for human review", () => {
    expect(classifyReply("let's talk this week").flagForHuman).toBe(true);
    expect(classifyReply("the price is a concern for us").flagForHuman).toBe(true);
    expect(classifyReply("wrong person, not responsible for this").flagForHuman).toBe(true);
    expect(classifyReply("curious, tell me more").flagForHuman).toBe(true);
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(classifyReply("   UNSUBSCRIBE   me   please   ").intent).toBe("UNSUBSCRIBE");
  });

  describe("refusals are never HOT", () => {
    const refusals = [
      "Not interested, thanks",
      "We are not interested at this time",
      "No thanks.",
      "No thank you, we're all set",
      "Not looking for this right now",
      "We'll pass",
      "I will pass on this one",
      "Please don't call me",
      "Do not call this number again",
    ];
    it.each(refusals)("classifies %j as NOT_FIT and flags it for a human", (text) => {
      const result = classifyReply(text);
      expect(result.intent).toBe("NOT_FIT");
      expect(result.nextAction).toBe("pause_sequence");
      expect(result.flagForHuman).toBe(true);
    });

    const negatedAvailability = [
      "I'm not available this week",
      "We can't do a call right now",
      "No meeting needed",
    ];
    it.each(negatedAvailability)("does not treat %j as interest", (text) => {
      expect(classifyReply(text).intent).not.toBe("HOT");
    });
  });

  describe("genuine interest is still HOT", () => {
    const interested = [
      "Interested! Are you free Thursday?",
      "Yes, let's book a call",
      "I'm available tomorrow afternoon",
      "Can you send over a demo?",
    ];
    it.each(interested)("classifies %j as HOT", (text) => {
      expect(classifyReply(text).intent).toBe("HOT");
    });
  });

  it("keeps opt-outs ahead of everything else", () => {
    expect(classifyReply("Not interested, please unsubscribe me").intent).toBe("UNSUBSCRIBE");
  });

  it("keeps out-of-office replies ahead of refusals and interest", () => {
    expect(classifyReply("Automatic reply: I am out of the office and not available").intent).toBe(
      "OUT_OF_OFFICE",
    );
  });

  describe("opt-outs in other languages", () => {
    const optOuts = [
      // French
      "Merci de me désabonner de votre liste.",
      "Veuillez ne plus me contacter",
      "Ne m’écrivez plus s'il vous plaît",
      "Supprimez-moi de vos listes",
      // Italian
      "Per favore cancellami dalla lista",
      "Non contattarmi più",
      "Vorrei disiscrivermi",
      // Spanish
      "Quiero darme de baja",
      "No me contacten más",
      "Elimínenme de su lista",
      // German
      "Bitte entfernen Sie mich aus Ihrem Verteiler",
      "Ich möchte mich abmelden",
      "Kontaktieren Sie mich nicht mehr",
      // Dutch
      "Kunt u mij uitschrijven?",
      "Verwijder mij van de lijst",
      "Stuur me geen mails meer",
    ];
    it.each(optOuts)("classifies %j as UNSUBSCRIBE", (text) => {
      expect(classifyReply(text).intent).toBe("UNSUBSCRIBE");
    });

    it("matches with or without accents and with curly apostrophes", () => {
      expect(classifyReply("desabonnez-moi").intent).toBe("UNSUBSCRIBE");
      expect(classifyReply("Ne m\u2019ecrivez plus").intent).toBe("UNSUBSCRIBE");
      expect(classifyReply("Please don\u2019t contact me again").intent).toBe("UNSUBSCRIBE");
    });

    it("does not read ordinary foreign-language text as an opt-out", () => {
      for (const text of ["Merci pour votre message, parlons jeudi", "Gracias, me interesa", "Danke, klingt interessant", "Bedankt, klinkt goed"]) {
        expect(classifyReply(text).intent).not.toBe("UNSUBSCRIBE");
      }
    });
  });

  describe("out-of-office in other languages", () => {
    it.each([
      "Je suis absent du bureau jusqu'au 3 mars.",
      "Réponse automatique : je suis en congés.",
      "Sono fuori sede fino al 10.",
      "Estaré fuera de la oficina hasta el lunes. Respuesta automática.",
      "Ich bin abwesend und kehre am Montag zurück. Automatische Antwort.",
      "Ik ben afwezig tot maandag.",
    ])("classifies %j as OUT_OF_OFFICE", (text) => {
      expect(classifyReply(text).intent).toBe("OUT_OF_OFFICE");
    });
  });

  describe("automatic-reply headers", () => {
    it("override the wording", () => {
      const result = classifyReply("Thanks for your note. Not interested.", { autoReply: true });
      expect(result.intent).toBe("OUT_OF_OFFICE");
      expect(result.flagForHuman).toBe(false);
    });

    it("never turn an auto-responder's unsubscribe footer into an opt-out", () => {
      const footer = "I'm out for the week. To unsubscribe from our newsletter click here.";
      expect(classifyReply(footer, { autoReply: true }).intent).toBe("OUT_OF_OFFICE");
      // A human writing the same words still opts out.
      expect(classifyReply("Please unsubscribe me").intent).toBe("UNSUBSCRIBE");
    });
  });

  describe("saying yes to the offer", () => {
    const yes = [
      "Yes please, send it over",
      "Yes!",
      "Sure, go ahead",
      "Hi Sam, absolutely. Please do.",
      "That would be great, thank you",
      "I'd love that",
      "Yeah, send it through when it's ready",
    ];
    it.each(yes)("classifies %j as OFFER_ACCEPTED when the campaign has an offer", (text) => {
      const result = classifyReply(text, { hasOffer: true });
      expect(result.intent).toBe("OFFER_ACCEPTED");
      expect(result.flagForHuman).toBe(true);
      expect(result.flagReason).toMatch(/deliver it/);
    });

    it("does nothing special when the campaign has no offer", () => {
      expect(classifyReply("Yes please, send it over").intent).not.toBe("OFFER_ACCEPTED");
      expect(classifyReply("Yes please, send it over", { hasOffer: false }).intent).not.toBe("OFFER_ACCEPTED");
    });

    it.each([
      "Yes, let's talk Thursday",
      "Sure, can you call me tomorrow?",
      "Yes, book a meeting for next week",
      "Sure, but not now",
      "Yes but how much does it cost?",
      "Sure, tell me more first",
      "Yeah, who are you again?",
      "Yes, though maybe next quarter",
    ])("does not read %j as taking the offer", (text) => {
      expect(classifyReply(text, { hasOffer: true }).intent).not.toBe("OFFER_ACCEPTED");
    });

    it("still treats a meeting request as HOT", () => {
      expect(classifyReply("Yes, let's talk Thursday", { hasOffer: true }).intent).toBe("HOT");
    });

    it("keeps refusals, opt-outs and auto-replies ahead of it", () => {
      expect(classifyReply("Yes, not interested", { hasOffer: true }).intent).toBe("NOT_FIT");
      expect(classifyReply("Yes, unsubscribe me", { hasOffer: true }).intent).toBe("UNSUBSCRIBE");
      expect(classifyReply("Yes please", { hasOffer: true, autoReply: true }).intent).toBe("OUT_OF_OFFICE");
    });
  });

  it("falls back to NEUTRAL with human review required for ambiguous text", () => {
    const result = classifyReply("ok");
    expect(result.intent).toBe("NEUTRAL");
    expect(result.flagForHuman).toBe(true);
  });
});
