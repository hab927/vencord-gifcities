/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { isNonNullish } from "@utils/guards";
import definePlugin from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

interface GifcitiesGIF {
    // thankfully everything in gifcities is, in fact, a gif.

    // keywords in the gif
    url_text: string;
    // the link to the gif
    gif: string;
    width: number;
    height: number;
    checksum: string;
    // page that the gif originated from
    page: string;
}

// shamefully stolen from Lunascaped's extension and edited to work for gifcities

interface DiscordGif {
    id: string;
    title: string;
    url: string;
    src: string;
    gif_src: string;
    width: number;
    height: number;
    preview: string;
}

function toDiscordGif(item: GifcitiesGIF): DiscordGif | null {
    const sourceURL = "https://web.archive.org/web/" + item.gif.replace(/(\d+)\//, "$1id_/");
    // const previewURL = "https://web.archive.org/web/" + item.gif.replace(/(\d+)\//, "$1id_/");
    const previewURL = "https://web.archive.org/web/" + item.gif.replace(/(\d+)\//, "$1im_/");
    const dGif = {
        id: item.url_text.replace(" ", "-"), // why not, treat the checksum as the id!
        title: "", // discord always returns a blank string
        url: sourceURL,
        gif_src: sourceURL,
        src: previewURL, // this is actually the preview url
        width: item.width,
        height: item.height,
        preview: sourceURL // i cant believe you lied to me
    };
    console.log(dGif);
    return dGif;
}

function mapToDiscordGifs(items: GifcitiesGIF[]) {
    console.log("mapping");
    return items.map(toDiscordGif).filter(isNonNullish);
}

async function gifcitiesFetch<TResult>(params: Record<string, string>) {
    console.log("fetching");
    // i don't think there are any other query endpoints other than gifsearch
    const url = "https://gifcities.archive.org/api/v1/gifsearch?" + new URLSearchParams({
        ...params
    });

    // gifcities api returns an array of gif objects
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`gifcities fetch failed with status ${res.status}.`);
    }

    const data = await res.json() as GifcitiesGIF[];
    return data;
}

export default definePlugin({
    name: "GifcitiesSearch",
    description: "Allows searching on Gifcities as an alternative.",
    authors: [{ name: "hab", id: 186964491890720769n }],
    patches: [
        {
            find: "renderHeaderContent(){",
            replacement: {
                match: /placeholder:(\i),"aria-label":(\i)/,
                replace: 'placeholder:$1?.replace(/Giphy|Klipy/gi,"GifCities"),"aria-label":$2?.replace(/Giphy|Klipy/gi,"GifCities")'
            }
        },
        {
            find: '"GIF_PICKER_INITIALIZE"',
            replacement:
            {
                match: /let \i=Date\.now\(\);\i\([^)]+\),\i\.\i\.get\(\{url:\i\.\i\.GIFS_SEARCH,query:\{q:(\i),/,
                replace: "return $self.gifcitiesSearch($1);$&"
            }
        },
        {
            find: "?this.renderEmptyFavorites():(",
            replacement: [
                // {
                //     match: /(;\s*)(return\s*\{imagePool:\s*\i,videoPool:\s*)(\i)/,
                //     replace: "$1 $self.fixDivs($3); $2$3"
                // },
                {
                    match: /(.createElement\(")video("\);return)/,
                    replace: "$1img$2"
                },
            ]
        },
    ],

    tempDiv: document.createElement("video"), // storage property to track video div

    gifcitiesSearch(query: string) {
        gifcitiesFetch({ q: query, limit: "50" })
            .then(results => {
                const items = mapToDiscordGifs(results);
                console.log(items[0].preview); // debugging purposes
                FluxDispatcher.dispatch(
                    items.length
                        ? { type: "GIF_PICKER_QUERY_SUCCESS", query, items }
                        : { type: "GIF_PICKER_QUERY_FAILURE", query }
                );
            }).catch(() => {
                FluxDispatcher.dispatch({ type: "GIF_PICKER_QUERY_FAILURE", query });
            });
    },

    // fixDivs(videoPool: any) {
    //     const elements = videoPool._elements;
    //     for (let i = 0; i < elements.length; i++) {
    //         const video = elements[i];
    //         const img = document.createElement("img");
    //         img.className = video.className;
    //         img.width = video.width;
    //         img.height = video.height;
    //         img.src = video.src;

    //         this.tempDiv.replaceWith(img);
    //     }
    // }
});

