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
  const profile = storage.selections?.[storage.selected];
  if (!profile) return null;

  const restart = () => {
    try {
      RPInstance.onUnload();
      RPInstance.onLoad();
    } catch (error) {
      logger.error("[Rich Presence] Failed to refresh", error);
    }
  };

  return (
    <ScrollView style={{ paddingBottom: 24 }}>
      <View style={{ padding: 16 }}>
        <FormText style={{ marginBottom: 12 }}>Configure your custom Rich Presence.</FormText>
        <TouchableOpacity
          style={{ backgroundColor: "#5865F2", padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 16 }}
          onPress={restart}
        >
          <FormText style={{ color: "white" }}>Update Presence</FormText>
        </TouchableOpacity>

        <FormSection title="Basic">
          <FormInput title="Application Name" value={profile.name || ""} onChange={(value) => profile.name = value} />
          <FormInput title="Application ID" value={String(profile.application_id || "")} onChange={(value) => profile.application_id = value} keyboardType="numeric" />
          <FormInput title="Activity Type (0-5)" value={String(profile.type ?? 0)} onChange={(value) => profile.type = Number(value)} keyboardType="numeric" />
          <FormInput title="Details" value={profile.details || ""} onChange={(value) => profile.details = value} />
          <FormInput title="State" value={profile.state || ""} onChange={(value) => profile.state = value} />
        </FormSection>

        <FormSection title="Timestamps">
          <FormSwitchRow label="Enable timestamps" value={!!profile.timestamps?._enabled} onValueChange={(value) => { profile.timestamps._enabled = value; restart(); }} />
          <FormSwitchRow label="Real-time timestamp" value={!!profile.timestamps?._realtime} disabled={!profile.timestamps?._enabled} onValueChange={(value) => { profile.timestamps._realtime = value; restart(); }} />
          <FormInput title="Start (ms)" value={String(profile.timestamps?.start ?? "")} disabled={!profile.timestamps?._enabled || !!profile.timestamps?._realtime} onChange={(value) => profile.timestamps.start = Number(value)} keyboardType="numeric" />
          <FormInput title="End (ms)" value={String(profile.timestamps?.end ?? "")} disabled={!profile.timestamps?._enabled || !!profile.timestamps?._realtime} onChange={(value) => profile.timestamps.end = Number(value)} keyboardType="numeric" />
          <FormRow label="Use current time" subLabel="Set the current time as the start timestamp" disabled={!profile.timestamps?._enabled || !!profile.timestamps?._realtime} trailing={FormRow.Arrow} onPress={() => { profile.timestamps.start = Date.now(); restart(); }} />
          <FormText style={{ marginLeft: 16, marginTop: 8 }}>Real-time mode refreshes from your device clock every minute.</FormText>
        </FormSection>
      </View>
    </ScrollView>
  );
}
