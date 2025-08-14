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

        {/* Left Column */}
        <div className="mx-auto py-8">
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

        {/* Bottom Bar */}
        <div className="border-t border-[#333] py-4 text-[0.9rem] mx-auto w-full">
          <p className="text-center text-white">
            © {new Date().getFullYear()} Sarvian Design Group. All rights
            reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
