import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

import styles from "./Tabs.module.css";

type Props<Value extends string> = {
    value: Value;
    onChange: (value: Value) => void;
    tabs: { value: Value; label: ReactNode }[];
};

// A row of tabs that switches what is shown below it (Base UI, styled with the @dextinity/ui tokens; @dextinity/ui has no tabs yet)
export function Tabs<Value extends string>({ value, onChange, tabs }: Props<Value>) {
    return (
        <BaseTabs.Root value={value} onValueChange={(newValue: Value) => onChange(newValue)}>
            <BaseTabs.List className={styles.list}>
                {tabs.map((tab) => (
                    <BaseTabs.Tab key={tab.value} value={tab.value} className={styles.tab}>
                        {tab.label}
                    </BaseTabs.Tab>
                ))}
                <BaseTabs.Indicator className={styles.indicator} />
            </BaseTabs.List>
        </BaseTabs.Root>
    );
}
