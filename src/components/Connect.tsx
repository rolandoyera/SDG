import Button from "./ui/Button";
import Container from "./ui/Container";
import ContactButton from "@/components/ui/ContactButton";

export default function Connect() {
  return (
    <div className="bg-banner">
      <Container
        className={`flex flex-col items-center justify-between gap-6 py-12 text-center md:text-left`}>
        <h3 className="text-3xl  text-white">Ready To Start?</h3>
        <ContactButton>Connect With Us</ContactButton>
      </Container>
    </div>
  );
}
