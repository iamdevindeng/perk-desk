// Verifies social preview metadata, public footer links, and aligned demo buttons.
// Called by: npm test; static rendering requires no browser or provider requests
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "@/app/layout";
import PresetPicker from "@/components/PresetPicker";

describe("public page metadata", () => {
  it("uses the deployed origin and matching Open Graph and Twitter descriptions", () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(String(metadata.metadataBase)).toBe("https://perk-desk.vercel.app/");
    expect(metadata.title).toBe("Perk Desk");
    expect(metadata.description).toEqual(expect.any(String));
    expect(metadata.description!.length).toBeGreaterThan(0);
    expect(metadata.openGraph).toMatchObject({ title: metadata.title, description: metadata.description });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: metadata.title, description: metadata.description });
  });

  it("declares a static 1200 by 630 social preview image", () => {
    expect(metadata.openGraph).toMatchObject({ images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }] });
    expect(metadata.twitter).toMatchObject({ images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }] });
  });

  it("ships a PNG preview whose dimensions match the declared metadata", () => {
    const image = readFileSync("public/opengraph-image.png");
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(image.toString("ascii", 12, 16)).toBe("IHDR");
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
  });

  it("links the MIT license and public source from the footer", () => {
    const markup = renderToStaticMarkup(RootLayout({ children: createElement("main", null, "Fake page") }));
    const footer = markup.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)![1];
    const links = Array.from(footer.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g),
      ([, href, label]) => ({ href, label: label.trim() }));
    expect(links).toContainEqual({ href: "https://github.com/iamdevindeng/perk-desk/blob/main/LICENSE", label: "MIT License" });
    expect(links).toContainEqual({ href: "https://github.com/iamdevindeng/perk-desk", label: "Source on GitHub" });
  });
});

it("gives both demo buttons full width with left-aligned text and separated arrows", () => {
  const markup = renderToStaticMarkup(createElement(PresetPicker, { onSelect: () => {} }));
  const buttons = Array.from(markup.matchAll(/<button\b[^>]*class="([^"]+)"/g), (match) => match[1].split(/\s+/));
  expect(buttons).toHaveLength(2);
  for (const classes of buttons) {
    expect(classes).toEqual(expect.arrayContaining(["w-full", "justify-between", "text-left"]));
  }
  const spans = Array.from(markup.matchAll(/<span\b[^>]*class="([^"]+)"/g), (match) => match[1].split(/\s+/));
  expect(spans.filter((classes) => classes.includes("flex-1") && classes.includes("text-left"))).toHaveLength(2);
  expect(spans.filter((classes) => classes.includes("shrink-0"))).toHaveLength(2);
});
