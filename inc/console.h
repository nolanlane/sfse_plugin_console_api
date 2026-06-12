#pragma once

namespace game
{
	class console
	{
	public:
		static void printf(const char* fmt, ...) {
			static auto p1 = RelocAddr<std::uintptr_t*>(0x061DF7A0); // 0x061E76D8
			static auto p2 = RelocAddr<std::uintptr_t(*)(std::uintptr_t, const char*, va_list)>(0x01EAA980); // 0x01EAD6D0

			if (*p1 && p2) {
				auto args = va_list();
				va_start(args, fmt);
				(*p2)(*p1, fmt, args);
				va_end(args);
			}
		}

		static void execute(const std::string& cmd) {
			static auto p1 = RelocAddr<std::uintptr_t*>(0x062C0BD8); // 0x062C8C18
			static auto p2 = RelocAddr<void(*)(std::uintptr_t, const char*)>(0x01EA1E10); // 0x01EA4B60
			(*p2)(*p1, cmd.data());
		}
	};
}
