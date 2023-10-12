import { parse } from 'node-html-parser';

interface Event {
  what: string;
  where: string;
  when: string;
  image?: string;
  description: string;
  url: string;
}

export default class EventHandler {

  events: Event[];

  constructor() {
    this.events = [];
    this.getEvents();
    setInterval(this.getEvents, 86400000); // 24 hours
  }

  // this is kind of shaky and only works if the event description is formatted correctly (using the WHAT, WHERE, WHEN, IN SHORT: format)
  async getEvents() {
    try {
      const response = await fetch("https://holvi.com/shop/AaltoCocktail/");
      const text = await response.text();
      const root = parse(text);
      const links = root.querySelectorAll("a.store-item-wrapper");
      for (let i = 0; i < links.length; i++) {
        const a = links[i];
        if (!(a.attributes.class.includes("store-item-wrapper-sold-out"))) {
          const url = "https://holvi.com" + a.attributes.href;
          const response2 = await fetch(url);
          const text2 = await response2.text();
          const root2 = parse(text2);
          let description = root2.querySelector(".product-description")?.text;
          if (description) {
            let what = "";
            let where = "";
            let when = "";
            description.split("\n").forEach((line: string) => {
              if (line.startsWith("WHAT:")) {
                what = line.substring(5).trim();
              } else if (line.startsWith("WHERE:")) {
                where = line.substring(6).trim();
              } else if (line.startsWith("WHEN:")) {
                when = line.substring(5).trim();
              }
            });
            description = description.split("IN SHORT:")[0].trim();
            let image: any = root2.querySelector("image-carousel")?.attributes.images;
            if (image) image = JSON.parse(image);
            if (image && image.length > 0) image = image[0].url;
            if (what && where && when && description) {
              this.events.push({
                what,
                where,
                when,
                description,
                image,
                url
              })
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

}