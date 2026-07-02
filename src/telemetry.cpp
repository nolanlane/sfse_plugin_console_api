#include "pch.h"

#include "telemetry.h"

#include <array>
#include <initializer_list>
#include <ctime>
#include <iomanip>
#include <mutex>
#include <sstream>

namespace plugin::telemetry
{
	namespace
	{
		struct telemetry_state
		{
			std::string last_update_at;
			std::uint64_t update_count{ 0 };
			bool initialized{ false };
		};

		telemetry_state& state()
		{
			static telemetry_state instance{};
			return instance;
		}

		std::mutex& state_mutex()
		{
			static std::mutex instance{};
			return instance;
		}

		std::string utc_now_iso8601()
		{
			using namespace std::chrono;

			auto now = system_clock::now();
			auto now_seconds = floor<seconds>(now);
			auto millis = duration_cast<milliseconds>(now - now_seconds).count();

			std::time_t raw_time = system_clock::to_time_t(now);
			std::tm utc_tm{};
#if defined(_WIN32)
			gmtime_s(&utc_tm, &raw_time);
#else
			gmtime_r(&raw_time, &utc_tm);
#endif

			std::ostringstream output;
			output << std::put_time(&utc_tm, "%Y-%m-%dT%H:%M:%S");
			output << '.' << std::setw(3) << std::setfill('0') << millis << 'Z';
			return output.str();
		}

		std::string escape_json(std::string_view value)
		{
			std::string output;
			output.reserve(value.size() + 8);

			for (unsigned char ch : value) {
				switch (ch) {
				case '\\': output += "\\\\"; break;
				case '"': output += "\\\""; break;
				case '\b': output += "\\b"; break;
				case '\f': output += "\\f"; break;
				case '\n': output += "\\n"; break;
				case '\r': output += "\\r"; break;
				case '\t': output += "\\t"; break;
				default:
					if (ch < 0x20) {
						std::ostringstream hex;
						hex << "\\u" << std::uppercase << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(ch);
						output += hex.str();
					}
					else {
						output.push_back(static_cast<char>(ch));
					}
					break;
				}
			}

			return output;
		}

		std::string quote_json(std::string_view value)
		{
			return std::string("\"") + escape_json(value) + "\"";
		}

		std::string json_bool(bool value)
		{
			return value ? "true" : "false";
		}

		std::string json_null()
		{
			return "null";
		}

		std::string json_array(std::initializer_list<std::string_view> values)
		{
			std::string output = "[";
			bool first = true;

			for (auto value : values) {
				if (!first)
					output += ',';

				output += quote_json(value);
				first = false;
			}

			output += ']';
			return output;
		}

		std::string json_empty_array()
		{
			return "[]";
		}

		telemetry_state snapshot_state()
		{
			std::scoped_lock lock(state_mutex());
			return state();
		}

		std::string current_last_update_at(std::string_view generated_at)
		{
			auto cache = snapshot_state();
			if (cache.initialized && !cache.last_update_at.empty())
				return cache.last_update_at;

			return std::string(generated_at);
		}

		std::string build_status_json(std::string_view generated_at)
		{
			auto cfg = plugin::app::cfg();
			auto server = plugin::app::server();
			auto cache = snapshot_state();
			auto host = server->running() ? server->host() : cfg->api_hosting.host;

			std::string output = "{";
			output += "\"schemaVersion\":1,";
			output += "\"generatedAt\":" + quote_json(generated_at) + ",";
			output += "\"source\":\"static-config\",";
			output += "\"available\":true,";
			output += "\"confidence\":\"verified\",";
			output += "\"stale\":false,";
			output += "\"ttlMs\":5000,";
			output += "\"warnings\":" + json_empty_array() + ",";
			output += "\"data\":{";

			output += "\"plugin\":{";
			output += "\"name\":" + quote_json(PLUGIN_NAME) + ",";
			output += "\"version\":\"unknown\",";
			output += "\"sfseLoaded\":true,";
			output += "\"gameRuntime\":\"unknown\"";
			output += "},";

			output += "\"server\":{";
			output += "\"enabled\":" + json_bool(cfg->api_hosting.enable) + ",";
			output += "\"running\":" + json_bool(server->running()) + ",";
			output += "\"host\":" + quote_json(host) + ",";
			output += "\"configuredHost\":" + quote_json(cfg->api_hosting.host) + ",";
			output += "\"port\":" + std::to_string(cfg->api_hosting.port) + ",";
			output += "\"corsDisabled\":" + json_bool(cfg->api_hosting.disable_cors) + ",";
			output += "\"staticFilesDisabled\":" + json_bool(cfg->api_hosting.disable_static_files);
			output += "},";

			output += "\"features\":{";
			output += "\"rawConsole\":true,";
			output += "\"rawStream\":true,";
			output += "\"structuredStatus\":true,";
			output += "\"structuredPlayer\":true,";
			output += "\"structuredLocation\":true,";
			output += "\"structuredSnapshot\":true,";
			output += "\"typedEvents\":false,";
			output += "\"inventory\":false,";
			output += "\"ship\":false,";
			output += "\"quests\":false";
			output += "},";

			output += "\"snapshot\":{";
			output += "\"cacheInitialized\":" + json_bool(cache.initialized) + ",";
			output += "\"lastUpdateAt\":" + quote_json(current_last_update_at(generated_at)) + ",";
			output += "\"updateCount\":" + std::to_string(cache.update_count);
			output += "}";

			output += "}}";
			return output;
		}

		std::string build_player_json(std::string_view generated_at)
		{
			std::string output = "{";
			output += "\"schemaVersion\":1,";
			output += "\"generatedAt\":" + quote_json(generated_at) + ",";
			output += "\"source\":\"snapshot-cache\",";
			output += "\"available\":true,";
			output += "\"confidence\":\"fallback\",";
			output += "\"stale\":false,";
			output += "\"ttlMs\":1000,";
			output += "\"warnings\":" + json_array({ "Gameplay-derived values are unavailable until direct game access is verified." }) + ",";
			output += "\"data\":{";
			output += "\"formId\":" + json_null() + ",";
			output += "\"name\":" + json_null() + ",";
			output += "\"level\":" + json_null() + ",";
			output += "\"xp\":" + json_null() + ",";
			output += "\"health\":{";
			output += "\"current\":" + json_null() + ",";
			output += "\"maximum\":" + json_null() + ",";
			output += "\"percent\":" + json_null();
			output += "},";
			output += "\"oxygen\":{";
			output += "\"current\":" + json_null() + ",";
			output += "\"maximum\":" + json_null() + ",";
			output += "\"percent\":" + json_null();
			output += "},";
			output += "\"carryWeight\":{";
			output += "\"current\":" + json_null() + ",";
			output += "\"maximum\":" + json_null() + ",";
			output += "\"units\":\"mass\"";
			output += "},";
			output += "\"credits\":" + json_null() + ",";
			output += "\"flags\":{";
			output += "\"inCombat\":" + json_null() + ",";
			output += "\"weaponDrawn\":" + json_null() + ",";
			output += "\"inMenu\":" + json_null() + ",";
			output += "\"inDialogue\":" + json_null() + ",";
			output += "\"inShip\":" + json_null();
			output += "}";
			output += "}";
			output += "}";
			return output;
		}

		std::string build_location_json(std::string_view generated_at)
		{
			std::string output = "{";
			output += "\"schemaVersion\":1,";
			output += "\"generatedAt\":" + quote_json(generated_at) + ",";
			output += "\"source\":\"snapshot-cache\",";
			output += "\"available\":true,";
			output += "\"confidence\":\"fallback\",";
			output += "\"stale\":false,";
			output += "\"ttlMs\":1000,";
			output += "\"warnings\":" + json_array({ "Location identifiers are not yet verified against Starfield runtime objects." }) + ",";
			output += "\"data\":{";
			output += "\"cell\":{";
			output += "\"formId\":" + json_null() + ",";
			output += "\"editorId\":" + json_null() + ",";
			output += "\"name\":" + json_null();
			output += "},";
			output += "\"worldspace\":{";
			output += "\"formId\":" + json_null() + ",";
			output += "\"editorId\":" + json_null() + ",";
			output += "\"name\":" + json_null();
			output += "},";
			output += "\"planet\":{";
			output += "\"formId\":" + json_null() + ",";
			output += "\"name\":" + json_null() + ",";
			output += "\"system\":" + json_null();
			output += "},";
			output += "\"position\":{";
			output += "\"x\":" + json_null() + ",";
			output += "\"y\":" + json_null() + ",";
			output += "\"z\":" + json_null();
			output += "},";
			output += "\"rotation\":{";
			output += "\"x\":" + json_null() + ",";
			output += "\"y\":" + json_null() + ",";
			output += "\"z\":" + json_null();
			output += "},";
			output += "\"interior\":" + json_null() + ",";
			output += "\"loaded\":" + json_null();
			output += "}";
			output += "}";
			return output;
		}
	}

	void mark_snapshot_updated()
	{
		std::scoped_lock lock(state_mutex());
		state().initialized = true;
		state().update_count += 1;
		state().last_update_at = utc_now_iso8601();
	}

	std::string status_json()
	{
		return build_status_json(utc_now_iso8601());
	}

	std::string player_json()
	{
		return build_player_json(utc_now_iso8601());
	}

	std::string location_json()
	{
		return build_location_json(utc_now_iso8601());
	}

	std::string snapshot_json()
	{
		auto generated_at = utc_now_iso8601();
		auto status = build_status_json(generated_at);
		auto player = build_player_json(generated_at);
		auto location = build_location_json(generated_at);

		std::string output = "{";
		output += "\"schemaVersion\":1,";
		output += "\"generatedAt\":" + quote_json(generated_at) + ",";
		output += "\"source\":\"snapshot-cache\",";
		output += "\"available\":true,";
		output += "\"confidence\":\"best-effort\",";
		output += "\"stale\":false,";
		output += "\"ttlMs\":1000,";
		output += "\"warnings\":" + json_empty_array() + ",";
		output += "\"data\":{";
		output += "\"status\":" + status + ",";
		output += "\"player\":" + player + ",";
		output += "\"location\":" + location;
		output += "}";
		output += "}";
		return output;
	}
}
