const fs = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const args = process.argv.slice(2); // skip first 2 default entries
let recurse = false;
let r_depth = -1;
let save_path;
let site_url;
let start_url;

// the storage
const pages = new Set();
const images = new Set();

const message = "Working    ";
let dots = "";

// Argument parsing and initial error escapes.
async function setup() {
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-r':
                recurse = true;
                break;
            case '-l':
                r_depth = Number(args[i + 1]);
                if (!Number.isInteger(r_depth)) {
                    console.error("Error: -l expects an integer");
                    process.exit(1);
                }
                if (r_depth < 0) {
                    console.error("Error: -l expects a positive integer");
                    process.exit(1);
                }
                i++;
                break;
            case '-p':
                save_path = args[i + 1];
                i++;
                break;
            default:
                if (site_url !== undefined) {
                    console.error("Error: just one site may be provided at once.");
                    process.exit(1);
                }
                start_url = args[i];
                site_url = new URL(args[i]).hostname;
        }
    }

    // Secondary error handling.
    if (site_url === undefined) {
        console.error("Need a site to crawl, try again!");
        process.exit(1);
    }

    if (r_depth !== -1 && recurse === false) {
        console.error("No recursion requested while providing a depth argument.\n\
    Proceeding without recursive crawl.");
    }

    // Set defaults.
    if (save_path === undefined) {
        save_path = "./data/";
    }

    if (r_depth < 0) {
        r_depth = 5;
    }

    pages.add(start_url);

    console.log("Correct use.\n\
    recursive: ", recurse, ", depth: ", r_depth, ", save path: ", save_path, ", crawl url: ", site_url);
    console.log("Starting with scraperation.");
}

function normalize_url(url) {
    if (url.startsWith("//")) {
        return "https://" + url.slice(2);
    } else if (url[0] === "/") {
        return "https://" + site_url + url;
    } else if (url.startsWith("http")) {
        return url;
    } else {
        return "https://" + url;
    }
}

// The actual work.

function show_progress() {
    dots += ".";
    process.stdout.write(`\r${message}${dots}   `);
}
show_progress();

async function crawl_page(url, r_count) {
    if (r_count === 0) return;

    try {
        url = normalize_url(url);
        const response = await fetch(url);
        const page = await response.text();
        // Process the page here...

        await parse_page(page, r_count, url);
        show_progress();
        
    } catch (err) {
        console.error("Fetch error:", err);
        return;  // return early if error
    }
}

async function add_page(url, r_count) {
    if (r_count <= 1) return;
    if (!pages.has(url)) {
        pages.add(url); // async race.
    
        // crawl the page
        await crawl_page(url, r_count - 1);
    }
}

// Parallel.
async function recursive_page_crawl(page, r_count) {
    const regex = /<a\s+[^>]*?href=["']([^"']+)["'][^>]*?>/gi;
    const matches = [...page.matchAll(regex)];

    const promises = [];

    for (const match of matches) {
        const url = match[1]; // Captured href value
        
        if (!url.includes(site_url)) {
            if (url[0] === '/') {
                // Push promise instead of awaiting immediately
                promises.push(add_page(site_url + url, r_count));
            }
            continue;
        }

        promises.push(add_page(url, r_count));
    }

    // Wait for all add_page calls to finish in parallel
    await Promise.all(promises);
}

async function add_images(page, url) {
    const regex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?>/gi;
    const matches = [...page.matchAll(regex)];

    for (const match of matches) {
        const src = match[1];

        images.add(normalize_url(src));
    }
}

// page is a string with the html
async function parse_page(page, r_count, url) {
    // check for all the links
        // if a link is in there we can async try to go over with this same func again after we check the set and add it.
    if (recurse === true) {
        await recursive_page_crawl(page, r_count)
    }

    // check all the images
    await add_images(page, url);

}

async function writeWithFallback(fullPath, buffer) {
  let filePath = fullPath;
  let i = 1;

  const { dir, name, ext } = path.parse(fullPath);

  while (true) {
    try {
      await fs.access(filePath);
      // File exists, try next suffix
      filePath = path.join(dir, `${name}(${i})${ext}`);
      i++;
    } catch {
      // File doesn't exist, safe to write
      break;
    }
  }

  await fs.writeFile(filePath, buffer);
  return filePath;
}


async function download_image(image_url, save_path) {
    console.log(image_url);
    const response = await fetch(image_url);

    if (!response.ok) {
        console.error("This image does not exist", image_url);
        return;
    }

    const buffer = await response.arrayBuffer();
    const filename = path.basename(new URL(image_url).pathname);
    const fullPath = path.join(save_path, filename);

    // await fs.writeFile(fullPath, Buffer.from(buffer));
    // return fullPath;
    return writeWithFallback(fullPath, Buffer.from(buffer));
}



function pull_images() {
    const extensions = [".jpg", "jpeg", ".png", ".gif", "bmp"];
    for (const image of images) {
        console.error("img: ", image);

        const matches = extensions.some(ext => image.toLowerCase().endsWith(ext));
        if (matches) {
            download_image(image, save_path);
        }
    }
}

(async () => {
    await setup();
    await crawl_page(start_url, r_depth).then(() => {console.error("\n")})
    // pull in the images
    pull_images();
})();
