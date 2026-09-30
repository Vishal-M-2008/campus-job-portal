import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { LoginForm } from "./App";
import { store } from "./store";

test("failed login shows the error code", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: "invalid_credentials" }),
  }));
  render(<Provider store={store}><LoginForm /></Provider>);
  await userEvent.type(screen.getByLabelText("Email"), "student@srm.edu");
  await userEvent.type(screen.getByLabelText("Password"), "password-is-not-real");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid_credentials");
});
