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

// shamefully stolen from Lunascape's extension and edited to work for gifcities

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
                {
                    match: /,\[\i\]=(\i)\.useState\(\(\)=>new (\i)\(\(\)=>\{let \i=(\i).createElement\("video"\);return \i.className=(\i\.\i)/,
                    // $1: main react component
                    // $2: video pool constructor variable
                    // $3: element handler thing
                    // $4: div classname variable
                    replace: ",[secretThirdEvilPool]=$self.createNewPool($1,$2,$3,$4)$&"
                },
                {
                    match: /(\)\);return\{imagePool:\i,videoPool:\i)}/,
                    replace: "$1,gifPool:secretThirdEvilPool}"
                }
            ]
        },
        {
            find: "this.props.hideFavoritesTile)",
            replacement: {
                match: /(children:\s*\[)\i\s*===\s*\i\.\i\.TRENDING_GIFS/,
                replace: "$1false"
            }
        },
        {
            find: "[u.A.unsafe_rawColors.PREMIUM_TIER_1_PURPLE.css,",
            replacement: [
                {
                    match: /(super\(\i\);const\{format:\i,color:\i,imagePool:\i)(\}=this\.props;)/,
                    replace: "$1,gifPool:gifPool$2"
                },
                {
                    match: /(videoPool:\i)(\},ref:\i\}=this;)/,
                    replace: "$1,gifPool:gifPool$2"
                },
                {
                    match: /let \i=(\i)\.getElement\(\);(\i)\.oncanplay=this\.handleCanPlay,(\i\.src=(\i),)/,
                    // $2: src: string, check ending against .gif or .webm and pull element based on that
                    replace: "let $2=$self.getPoolElement($1,$4);$3"
                }
            ]
        }
    ],

    gifcitiesSearch(query: string) {
        gifcitiesFetch({ q: query, limit: "50" })
            .then(results => {
                const items = mapToDiscordGifs(results);
                // console.log(items[0].preview); // debugging purposes
                FluxDispatcher.dispatch(
                    items.length
                        ? { type: "GIF_PICKER_QUERY_SUCCESS", query, items }
                        : { type: "GIF_PICKER_QUERY_FAILURE", query }
                );
            }).catch(() => {
                FluxDispatcher.dispatch({ type: "GIF_PICKER_QUERY_FAILURE", query });
            });
    },

    createNewPool(r: any, poolConstructor: any, elementManager: any, className: string) {
        const gifPool = r.useState(() => new poolConstructor(() => {
            const e = elementManager.createElement("img");
            e.className = className;
            return e;
        }));
        const [temporaryVariableYay] = gifPool;
        this.gifPoolInstance = temporaryVariableYay;
        return gifPool;
    },

    getPoolElement(r: any, src: string) {
        let element: Node[];
        if (src.endsWith(".gif")) {
            // pull from gif pool
            element = this.gifPoolInstance.getElement();
        }
        else {
            // pull from normal video pool
            element = r.getElement();
        }
        return element;
    }
});
