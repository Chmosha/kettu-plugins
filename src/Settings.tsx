import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import RPInstance from ".";
import { logger } from "@vendetta";

const { View, ScrollView, TouchableOpacity } = ReactNative;
const { FormText, FormInput, FormRow, FormSwitchRow, FormSection } = Forms;

export default function Settings() {
  useProxy(storage);
  const settings = useProxy(storage.selections[storage.selected]) as Activity;

  return (
    <ScrollView style={{ paddingBottom: 24 }}>
      <View style={{ padding: 16 }}>
        <FormText style={{ marginBottom: 12 }}>Configure your custom RPC below.</FormText>
        <TouchableOpacity
          style={{ backgroundColor: "#5865F2", padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 16 }}
          onPress={() => { RPInstance.onUnload(); RPInstance.onLoad(); }}
        >
          <FormText style={{ color: "white" }}>Update Presence</FormText>
        </TouchableOpacity>

        <FormSection title="Basic">
          <FormInput title="Application Name" value={settings.name} onChange={(v) => settings.name = v} />
          <FormInput title="Application ID" value={settings.application_id} onChange={(v) => settings.application_id = v} keyboardType="numeric" />
          <FormInput title="Activity Type (0-5)" value={String(settings.type ?? 0)} onChange={(v) => settings.type = Number(v)} keyboardType="numeric" />
          <FormInput title="Details" value={settings.details} onChange={(v) => settings.details = v} />
          <FormInput title="State" value={settings.state} onChange={(v) => settings.state = v} />
        </FormSection>

        <FormSection title="Timestamps">
          <FormSwitchRow label="Enable timestamps" value={settings.timestamps._enabled} onValueChange={(v) => settings.timestamps._enabled = v} />
          <FormSwitchRow
            label="Real-time timestamp"
            value={!!settings.timestamps._realtime}
            disabled={!settings.timestamps._enabled}
            onValueChange={(v) => {
              settings.timestamps._realtime = v;
              RPInstance.onUnload();
              RPInstance.onLoad();
            }}
          />
          <FormInput title="Start (ms)" value={String(settings.timestamps?.start ?? "")}
            disabled={!settings.timestamps._enabled || !!settings.timestamps._realtime}
            onChange={(v) => settings.timestamps.start = Number(v)} keyboardType="numeric" />
          <FormInput title="End (ms)" value={String(settings.timestamps?.end ?? "")}
            disabled={!settings.timestamps._enabled || !!settings.timestamps._realtime}
            onChange={(v) => settings.timestamps.end = Number(v)} keyboardType="numeric" />
          <FormRow label="Use current time" subLabel="Set now as start timestamp"
            disabled={!settings.timestamps._enabled || !!settings.timestamps._realtime}
            trailing={FormRow.Arrow}
            onPress={() => settings.timestamps.start = Date.now()} />
          <FormText style={{ marginLeft: 16, marginTop: 8 }}>
            Real-time timestamp refreshes from your device clock every minute.
          </FormText>
        </FormSection>
      </View>
    </ScrollView>
  );
}
