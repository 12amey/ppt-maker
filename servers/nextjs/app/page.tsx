import AuthGate from "@/components/Auth/AuthGate";
import Home from "@/components/Home";
import { ConfigurationInitializer } from "./ConfigurationInitializer";
import { isAuthDisabled } from "@/utils/auth";
import { getServerAuthStatus } from "@/utils/serverAuth";
import { redirect } from "next/navigation";

const page = async () => {
    if (process.env.PRESENTON_LOCAL_SOURCE === "true" && isAuthDisabled()) {
        redirect("/ppt-maker");
    }
    if (isAuthDisabled()) {
        return (
            <ConfigurationInitializer>
                <Home />
            </ConfigurationInitializer>
        );
    }

    const status = await getServerAuthStatus();
    if (status.configured && status.authenticated) {
        return (
            <ConfigurationInitializer>
                <Home />
            </ConfigurationInitializer>
        );
    }

    return <AuthGate />;
};

export default page;
