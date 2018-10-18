
#include <stdbool.h>
#include <string.h>
#include <ctype.h>

#include "symtable.h"



void fus_symtable_entry_init_zero(fus_symtable_entry_t *entry){
    entry->table = NULL;
    entry->token = NULL;
    entry->token_len = 0;
    entry->is_name = false;
}

void fus_symtable_entry_init(fus_symtable_entry_t *entry,
    fus_symtable_t *table, const char *token, int token_len
){
    entry->table = table;
    entry->token = fus_strndup(table->core, token, token_len);
    entry->token_len = token_len;
    entry->is_name = token_len > 0 &&
        (token[0] == '_' || isalpha(token[0]));
}

void fus_symtable_entry_cleanup(fus_symtable_entry_t *entry){
    free(entry->token);
}



void fus_symtable_init(fus_symtable_t *table, fus_core_t *core){
    table->core = core;
    fus_class_init(&table->class_entry, core, "symtable_entry",
        sizeof(fus_symtable_entry_t), table,
        &fus_class_init_symtable_entry,
        &fus_class_cleanup_symtable_entry);
}

void fus_symtable_cleanup(fus_symtable_t *table){
    fus_class_cleanup(&table->class_entry);
}



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_symtable_entry(fus_class_t *class, void *ptr){
    fus_symtable_entry_init_zero(ptr);
}

void fus_class_cleanup_symtable_entry(fus_class_t *class, void *ptr){
    fus_symtable_entry_cleanup(ptr);
}

