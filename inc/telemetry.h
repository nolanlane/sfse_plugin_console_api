#pragma once

#include <string>

namespace plugin::telemetry
{
	void mark_snapshot_updated();

	std::string status_json();
	std::string player_json();
	std::string location_json();
	std::string snapshot_json();
}
