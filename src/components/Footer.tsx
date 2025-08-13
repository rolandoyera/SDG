import Link from "next/link";
import Image from "next/image";
import Button from "./ui/Button";
import Container from "./ui/Container";

export default function Footer() {
  return (
    <footer className="bg-footer w-full mt-60 relative">
      {/* Newsletter Section */}
      <Container className="pt-10">
        <div className="absolute -mt-[75px] left-1/2 -translate-x-1/2 mb-7 px-0">
          <form className="inline-flex items-center gap-2.5 bg-white rounded-[999px] pl-2 pr-2 py-2 border-[5px] border-black/8 shadow-[0_8px_18px_rgba(0,0,0,0.18),_0_1px_0_#fff_inset]">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              name="email"
              placeholder="Email (we're not spammy!)"
              required
              className="border-0 outline-none bg-transparent text-[16px] text-[#333] w-[min(480px,60vw)] pl-2 py-3 placeholder:text-[#b7b7b7] focus-visible:ring-2 focus-visible:ring-[#c9b49a] focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-full"
            />
            <Button className="!rounded-full" type="submit">
              SUBSCRIBE
            </Button>
          </form>
        </div>
      </Container>

      {/* Footer Container */}
      <Container>
        {/* Footer Main Content */}
        <div className="flex flex-col md:flex-row md:justify-between gap-10 py-10">
          {/* Left Column */}
          <div className="flex flex-col items-center text-center max-w-[300px] mx-auto md:items-start md:text-left md:mx-0">
            <Image
              className="mx-auto brightness-0 invert"
              src="/logo.png"
              alt="Sarvian Design Group"
              width={0}
              height={0}
              sizes="200px"
              style={{ width: "200px", height: "auto" }}
            />
            <p className="mt-3 text-sm text-white text-center">
              Architecture and interior design firm.
            </p>
          </div>

          {/* Middle / Right Columns */}
          <div className="flex flex-wrap gap-8 md:flex-nowrap md:gap-20 text-sm mt-4 md:mt-0">
            {/* Column 1 */}
            <div className="min-w-[140px] md:border-l border-[#333] md:pl-2.5">
              <h3 className="text-white mb-4 font-medium text-h4">DISCOVER</h3>
              <ul className="list-none p-0 space-y-4">
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Custom Homes
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Interior Design
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Beachfront Homes
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2 */}
            <div className="min-w-[140px] border-l border-[#333] pl-8 md:pl-2.5 ml-5 md:ml-0">
              <h3 className="text-white mb-4 font-medium text-h4">ABOUT</h3>
              <ul className="list-none p-0 space-y-4">
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Our Story
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Team
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Careers
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3 */}
            <div className="min-w-[140px] md:border-l border-[#333] md:pl-2.5">
              <h3 className="text-white mb-4 font-medium text-h4">SOCIAL</h3>
              <ul className="list-none p-0 space-y-4">
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Instagram
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Facebook
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-[#ccc] hover:text-white">
                    Pinterest
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[#333] flex items-center justify-between py-4 text-[0.9rem]">
          <p className="m-0 text-white">
            © {new Date().getFullYear()} Sarvian Design Group. All rights
            reserved.
          </p>
          <div className="space-x-[15px]">
            <Link href="#" className="text-[#ccc] hover:text-white">
              Terms
            </Link>
            <Link href="#" className="text-[#ccc] hover:text-white">
              Privacy
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
