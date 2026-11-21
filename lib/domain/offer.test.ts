import { describe, expect, it } from "vitest";
import { offerExamples, offerProblem } from "./offer";

describe("offerProblem", () => {
  it("accepts every shipped example", () => {
    for (const example of offerExamples) expect(offerProblem(example), example).toBeNull();
  });

  it.each([
    "A written plan for getting you onto page one",
    "A mockup of your homepage with online booking",
    "A one-page audit of your onboarding emails with the three fixes we'd make first",
    "A list of ten competitors' pricing pages compared with yours",
  ])("accepts %j", (offer) => {
    expect(offerProblem(offer)).toBeNull();
  });

  it("treats an empty offer as fine, since it is optional", () => {
    expect(offerProblem("")).toBeNull();
    expect(offerProblem("   ")).toBeNull();
    expect(offerProblem(null)).toBeNull();
    expect(offerProblem(undefined)).toBeNull();
  });

  it.each([
    "20% off your first month",
    "A special discount for new customers",
    "Use my coupon code SAVE",
    "Free shipping on your first order",
    "A money-back guarantee on the pilot",
  ])("refuses a discount: %j", (offer) => {
    expect(offerProblem(offer)).toMatch(/discount asks them to buy first/);
  });

  it.each([
    "A personalised demo of the product",
    "A free trial of the platform",
    "A product walkthrough for your team",
    "Sign up for a free account",
  ])("refuses a demo or trial: %j", (offer) => {
    expect(offerProblem(offer)).toMatch(/demo or trial/);
  });

  it.each([
    "A quick call to discuss your goals",
    "A 15 minute intro meeting",
    "Let's book a chat next week",
    "A free consultation about your strategy",
    "Grab a coffee and a conversation",
  ])("refuses a call or meeting: %j", (offer) => {
    expect(offerProblem(offer)).toMatch(/call or meeting asks for their time/);
  });

  it("asks for more than a couple of words", () => {
    expect(offerProblem("A plan")).toMatch(/in a few words/);
    expect(offerProblem("Free audit")).toMatch(/in a few words/);
  });

  it("refuses an offer that is too long", () => {
    expect(offerProblem(`A written plan ${"for ".repeat(100)}growth`)).toMatch(/under 300 characters/);
  });

  it("matches whole words only", () => {
    expect(offerProblem("A written analysis of your callback process and scheduling gaps")).toBeNull();
    expect(offerProblem("A summary of your meeting-room booking costs by quarter")).toMatch(/call or meeting/);
  });
});
