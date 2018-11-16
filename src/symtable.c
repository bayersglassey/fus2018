
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
    fus_array_init(&table->entries, &table->class_entry);
}

void fus_symtable_cleanup(fus_symtable_t *table){
    fus_array_cleanup(&table->entries);
    fus_class_cleanup(&table->class_entry);
}



static int fus_symtable_append_from_token(fus_symtable_t *table,
    const char *token, int token_len
){
    fus_array_push(&table->entries);
    int sym_i = table->entries.len - 1;
    fus_symtable_entry_t *entry = fus_symtable_get_entry(table, sym_i);
    fus_symtable_entry_init(entry, table, token, token_len);
    return sym_i;
}

int fus_symtable_len(fus_symtable_t *table){
    return table->entries.len;
}

fus_symtable_entry_t *fus_symtable_get_entry(fus_symtable_t *table,
    int sym_i
){
    if(sym_i < 0)return NULL;
    fus_symtable_entry_t *entries = FUS_SYMTABLE_ENTRIES(*table);
    return &entries[sym_i];
}

const char *fus_symtable_get_token(fus_symtable_t *table, int sym_i){
    fus_symtable_entry_t *entry = fus_symtable_get_entry(table, sym_i);
    if(entry == NULL)return NULL;
    return entry->token;
}

const char *fus_symtable_get_token_safe(fus_symtable_t *table, int sym_i){
    const char *token = fus_symtable_get_token(table, sym_i);
    return token? token: "<SYM NOT FOUND>";
}

int fus_symtable_add_from_token(fus_symtable_t *table,
    const char *token, int token_len
){
    /* Assumes token is not in table. Adds it and returns its index */
    return fus_symtable_append_from_token(table, token, token_len);
}

int fus_symtable_get_from_token(fus_symtable_t *table,
    const char *token, int token_len
){
    /* Returns index of token in table, or -1 if not found */
    fus_symtable_entry_t *entries = FUS_SYMTABLE_ENTRIES(*table);
    int len = table->entries.len;
    for(int sym_i = len - 1; sym_i >= 0; sym_i--){
        fus_symtable_entry_t *entry = &entries[sym_i];
        if(
            entry->token_len == token_len &&
            !strncmp(entry->token, token, token_len)
        )return sym_i;
    }
    return -1;
}

int fus_symtable_get_or_add_from_token(fus_symtable_t *table,
    const char *token, int token_len
){
    /* Returns token's index in table, adding it first if not found */
    int sym_i = fus_symtable_get_from_token(table, token, token_len);
    if(sym_i < 0)return fus_symtable_append_from_token(table, token, token_len);
    return sym_i;
}


int fus_symtable_add_from_string(fus_symtable_t *table, const char *string){
    return fus_symtable_add_from_token(table, string, strlen(string));
}
int fus_symtable_get_from_string(fus_symtable_t *table, const char *string){
    return fus_symtable_get_from_token(table, string, strlen(string));
}
int fus_symtable_get_or_add_from_string(fus_symtable_t *table, const char *string){
    return fus_symtable_get_or_add_from_token(table, string, strlen(string));
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

